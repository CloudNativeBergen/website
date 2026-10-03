import 'server-only'
import { TRPCError } from '@trpc/server'
import { preconditionFailed } from '@/server/errors'
import type { Conference } from '@/lib/conference/types'
import {
  conferenceBaseUrl,
  hasConferenceDomain,
} from '@/lib/conference/baseUrl'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import { formatNumber } from '@/lib/format'
import { getSigningProvider } from '@/lib/contract-signing'
import { embedSignatureInPdfBuffer } from '@/lib/pdf/signature-embed'
import {
  ORGANIZER_SIGNATURE_MARKER,
  ORGANIZER_DATE_MARKER,
} from '@/lib/pdf/constants'
import {
  findBestContractTemplate,
  getContractTemplate,
} from './contract-templates'
import { generateContractPdf } from './contract-pdf'
import { checkContractReadiness } from './contract-readiness'
import { checkState } from './state-machine'
import {
  logContractStatusChange,
  logSignatureStatusChange,
  promoteToClosedWonOnContract,
} from './activity'
import { publishSponsorStatusChange } from './events'
import { sanitizeSponsorName } from './utils'
import { getSponsorForConference } from './sanity'
import { sendSponsorCommunication } from './communication-send'
import { getSponsorEmailTemplateBySlugForOrg } from '@/lib/sponsor/sanity'
import {
  buildTemplateVariables,
  processPortableTextVariables,
  processTemplateVariables,
} from '@/lib/sponsor/templates'
import type { PortableTextBlock as TemplateBlock } from '@/lib/sponsor/types'
import type { PortableTextBlock } from '@portabletext/types'
import { resolveRecipients, CommunicationRecipientError } from './communication'
import {
  contractActionFor,
  contractAttachments,
  contractCardHtml,
  type ContractAction,
} from './contract-send-state'
import type {
  CommunicationAttachment,
  CommunicationRecipient,
  SponsorForConferenceExpanded,
} from './types'

/** Who is acting: an organizer, or the cron (`null`). */
export interface ContractActor {
  id: string | null
  name?: string | null
  email?: string | null
}

export interface PrepareContractSendArgs {
  conference: Conference
  /** Already proven to belong to the current conference by the caller. */
  sfc: SponsorForConferenceExpanded
  recipientKeys: readonly string[]
  /** First send only: which recipient signs. Defaults to the stored signer, then the primary contact. */
  signerKey?: string
  /** First send only, already tenancy-guarded by the caller. Defaults to the best template for the tier. */
  contractTemplateId?: string
  /** First send only: the assigned organizer's counter-signature. */
  organizerSignatureDataUrl?: string
  actor: ContractActor
}

/**
 * Everything the send primitive needs for a contract send, plus the state
 * change to apply once the provider accepted it. Nothing here is persisted
 * before the email is out, except the PDF asset (an orphaned file on a failed
 * send is harmless; a contract-sent deal with no email is not).
 */
export interface ContractSendPlan {
  action: ContractAction
  /** First send: undo the stored agreement when nothing went out. Best-effort. */
  release?: () => Promise<void>
  /** The signer (first send and reminder) — merged as SIGNER_NAME / SIGNER_EMAIL. */
  signer?: CommunicationRecipient
  contractValue?: string
  appendHtml: string
  attachments: CommunicationAttachment[]
  /** Applied after the provider accepted the send; never throws. */
  afterSend: () => Promise<{ ok: boolean }>
}

/**
 * How long a stored-but-unsent agreement blocks another first send. A crash
 * between reserving and mailing leaves `contractReservedAt` set; after this
 * window the next send may reserve again (the old token was never mailed).
 */
const RESERVATION_SETTLE_MS = 10 * 60 * 1000
const IN_FLIGHT_MESSAGE =
  'Another organizer is sending this contract right now. Wait a moment and reload before trying again.'

function precondition(message: string): TRPCError {
  return new TRPCError({ code: 'PRECONDITION_FAILED', message })
}

function formatContractValue(
  sfc: Pick<SponsorForConferenceExpanded, 'contractValue' | 'contractCurrency'>,
): string | undefined {
  return sfc.contractValue
    ? `${formatNumber(sfc.contractValue)} ${sfc.contractCurrency || 'NOK'}`
    : undefined
}

function pickSigner(
  sfc: SponsorForConferenceExpanded,
  recipients: CommunicationRecipient[],
  signerKey: string | undefined,
): CommunicationRecipient {
  if (signerKey) {
    const named = recipients.find((r) => r.contactKey === signerKey)
    if (!named) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'The signer must be one of the chosen recipients',
      })
    }
    return named
  }
  return (
    recipients.find((r) => !!sfc.signerEmail && r.email === sfc.signerEmail) ??
    recipients.find((r) => r.isDefault) ??
    recipients[0]
  )
}

/**
 * ONE contract action, by state (#1264): first send, reminder, or the signed
 * copy. Decides from the sponsor's contract and signature state, refuses
 * before any costly work when the state cannot support the action, and
 * returns what to append to the email and what to do once it is out.
 */
export async function prepareContractSend(
  args: PrepareContractSendArgs,
): Promise<ContractSendPlan> {
  const { conference, sfc, actor } = args
  let recipients: CommunicationRecipient[]
  try {
    recipients = resolveRecipients(sfc.contactPersons, args.recipientKeys)
  } catch (error) {
    if (error instanceof CommunicationRecipientError) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })
    }
    throw error
  }
  const action = contractActionFor(sfc)
  const theme = conference.theme
  const contractValue = formatContractValue(sfc)

  if (action === 'signed-copy') {
    const url = sfc.contractDocument?.asset?.url
    // Only the digital signing flow replaces the stored document with the
    // signed one (and stamps `contractSignedBy`); a status set by hand leaves
    // the unsigned original in place, which must never go out as "signed".
    if (!url || !sfc.contractSignedBy) {
      throw precondition(
        sfc.contractSignedBy
          ? 'No signed agreement is stored for this sponsor yet. Check the signing status first.'
          : 'The signed status was set manually; no digitally signed document is stored, so there is no signed copy to send.',
      )
    }
    return {
      action,
      // The person who signed — merged as SIGNER_NAME in the confirmation.
      signer: {
        contactKey: '',
        name: sfc.signerName ?? sfc.signerEmail ?? '',
        email: sfc.signerEmail ?? '',
        isDefault: false,
      },
      contractValue,
      appendHtml: contractCardHtml({ action, url, theme }),
      attachments: contractAttachments(action, url),
      afterSend: async () => ({ ok: true }),
    }
  }

  if (action === 'remind') {
    const url = sfc.signingUrl!
    const signer =
      recipients.find((r) => r.email === sfc.signerEmail) ??
      ({
        contactKey: '',
        name: sfc.signerName ?? sfc.signerEmail ?? '',
        email: sfc.signerEmail ?? '',
        isDefault: false,
      } satisfies CommunicationRecipient)
    return {
      action,
      signer,
      contractValue,
      appendHtml: contractCardHtml({ action, url, theme }),
      attachments: contractAttachments(action, url),
      afterSend: async () => {
        try {
          await clientWrite
            .patch(sfc._id)
            // Atomic: an organizer's reminder and the cron's may land together.
            .setIfMissing({ reminderCount: 0 })
            .inc({ reminderCount: 1 })
            .commit()
          return { ok: true }
        } catch (error) {
          console.error('[contract-send] reminderCount update failed:', error)
          return { ok: false }
        }
      },
    }
  }

  // FIRST SEND. Readiness and state before any costly work (story 11).
  const readiness = checkContractReadiness(sfc)
  if (!readiness.canSend) {
    throw preconditionFailed(
      readiness.missing.filter((m) => m.severity === 'required'),
    )
  }
  const state = checkState('contract', 'contract-sent', sfc)
  if (!state.ok) throw preconditionFailed(state.missing)
  if (!sfc.sponsor?.name) {
    throw precondition(
      'Sponsor information is missing. Link a sponsor before sending a contract.',
    )
  }
  if (!sfc.conference?.title) {
    throw precondition(
      'Conference title is required for contract generation. Update the conference settings.',
    )
  }
  const signer = pickSigner(sfc, recipients, args.signerKey)

  const now = getCurrentDateTime()
  const organizerDisplayName =
    actor.name?.trim() || actor.email?.trim() || 'Organizer'
  // RESERVE the agreement before anything is mailed: the signing page resolves
  // the token through the stored `signatureId`, so a link that is emailed
  // before it is stored would be dead if the store failed — and two first
  // sends racing would overwrite each other's token. Decided on a fresh read,
  // BEFORE any costly work: refused (nothing mailed) when a contract is
  // already out, or when another send reserved within the settle window; a
  // reservation older than the window (a send that crashed or whose status
  // flip failed after mailing) is REUSED, so the link already in an inbox
  // stays the stored one and no second agreement is minted.
  const current = await clientReadUncached.fetch<{
    _rev: string
    contractStatus: string | null
    signatureStatus: string | null
    signatureId: string | null
    signingUrl: string | null
    contractReservedAt: string | null
  } | null>(
    `*[_type == "sponsorForConference" && _id == $id && conference._ref == $conferenceId][0]{ _rev, contractStatus, signatureStatus, signatureId, signingUrl, contractReservedAt }`,
    { id: sfc._id, conferenceId: conference._id },
  )
  if (!current || contractActionFor(current) !== 'send') {
    throw precondition(
      'A contract was just sent to this sponsor by someone else. Reload to see it.',
    )
  }
  const reserved = !!current.signatureId && !!current.signingUrl
  if (
    reserved &&
    current.contractReservedAt &&
    Date.now() - new Date(current.contractReservedAt).getTime() <
      RESERVATION_SETTLE_MS
  ) {
    throw precondition(IN_FLIGHT_MESSAGE)
  }
  let signingUrl: string
  let agreementId: string
  let reservation: Record<string, unknown>
  if (reserved) {
    signingUrl = current.signingUrl!
    agreementId = current.signatureId!
    reservation = {
      signerName: signer.name,
      signerEmail: signer.email,
      contractReservedAt: now,
    }
  } else {
    let templateId = args.contractTemplateId
    if (!templateId) {
      const best = await findBestContractTemplate(conference._id, sfc.tier?._id)
      if (best.error || !best.template) {
        throw precondition(
          `No contract template found for tier "${sfc.tier?.title ?? 'unknown'}". Create one in Settings first.`,
        )
      }
      templateId = best.template._id
    }
    const { template, error: templateError } =
      await getContractTemplate(templateId)
    if (templateError || !template) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Contract template not found. It may have been deleted.',
        cause: templateError,
      })
    }

    const primaryContact =
      sfc.contactPersons?.find((c) => c.isPrimary) ?? sfc.contactPersons?.[0]
    let pdfBuffer: Buffer
    try {
      pdfBuffer = await generateContractPdf(template, {
        sponsor: {
          name: sfc.sponsor.name,
          orgNumber: sfc.sponsor.orgNumber,
          address: sfc.sponsor.address,
          website: sfc.sponsor.website,
        },
        contactPerson: {
          name: primaryContact?.name ?? signer.name,
          email: primaryContact?.email ?? signer.email,
        },
        tier: sfc.tier
          ? { title: sfc.tier.title, tagline: sfc.tier.tagline }
          : undefined,
        addons: sfc.addons?.map((a) => ({ title: a.title })),
        contractValue: sfc.contractValue,
        contractCurrency: sfc.contractCurrency,
        conference: {
          title: sfc.conference.title,
          startDate: sfc.conference.startDate,
          endDate: sfc.conference.endDate,
          city: sfc.conference.city,
          organizer: sfc.conference.organizer,
          organizerOrgNumber: sfc.conference.organizerOrgNumber,
          organizerAddress: sfc.conference.organizerAddress,
          venueName: sfc.conference.venueName,
          venueAddress: sfc.conference.venueAddress,
          sponsorEmail: sfc.conference.sponsorEmail,
          logoBright: sfc.conference.logoBright,
        },
      })
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          'Failed to generate contract PDF. Check that the template is valid.',
        cause: error,
      })
    }
    if (!pdfBuffer?.length) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          'Contract PDF generation produced an empty document. Check the template configuration.',
      })
    }

    if (args.organizerSignatureDataUrl) {
      if (!actor.id || sfc.assignedTo?._id !== actor.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message:
            'Only the assigned organizer can counter-sign this contract.',
        })
      }
      try {
        pdfBuffer = await embedSignatureInPdfBuffer(
          pdfBuffer,
          args.organizerSignatureDataUrl,
          organizerDisplayName,
          {
            signatureMarker: ORGANIZER_SIGNATURE_MARKER,
            dateMarker: ORGANIZER_DATE_MARKER,
          },
        )
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to embed organizer signature into the contract PDF.',
          cause: error,
        })
      }
    }

    const filename = `contract-${sanitizeSponsorName(sfc.sponsor.name)}.pdf`
    let asset: { _id: string }
    try {
      asset = await clientWrite.assets.upload('file', pdfBuffer, {
        filename,
        contentType: 'application/pdf',
      })
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to upload contract PDF. Please try again.',
        cause: error,
      })
    }
    if (!asset?._id) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Contract PDF upload failed — no asset reference returned.',
      })
    }

    try {
      const provider = getSigningProvider(sfc.conference.signingProvider)
      const result = await provider.sendForSigning({
        pdf: pdfBuffer,
        filename,
        signerEmail: signer.email,
        agreementName: `Sponsorship Agreement - ${sfc.sponsor.name}`,
        message: `Please sign the sponsorship agreement for ${sfc.conference.title}.`,
        baseUrl: hasConferenceDomain(sfc.conference)
          ? conferenceBaseUrl(sfc.conference)
          : undefined,
      })
      agreementId = result.agreementId
      if (!result.signingUrl) {
        throw new Error('The signing provider returned no signing URL')
      }
      signingUrl = result.signingUrl
    } catch (error) {
      if (error instanceof TRPCError) throw error
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message:
          'Failed to create the digital signing agreement. Nothing was sent. Please try again.',
        cause: error,
      })
    }

    reservation = {
      signatureId: agreementId,
      signingUrl,
      contractTemplate: { _type: 'reference', _ref: templateId },
      contractDocument: {
        _type: 'file',
        asset: { _type: 'reference', _ref: asset._id },
      },
      signerName: signer.name,
      signerEmail: signer.email,
      contractReservedAt: now,
    }
  }

  try {
    await clientWrite
      .patch(sfc._id)
      .ifRevisionId(current._rev)
      .set(reservation)
      .commit()
  } catch (error) {
    // A write landed between the read and this patch: another send, or an
    // unrelated edit. Either way nothing was mailed; the organizer retries.
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: IN_FLIGHT_MESSAGE,
      cause: error,
    })
  }

  const release = async () => {
    try {
      // Only this send's token: a slow failure must never clear a later
      // send's reservation.
      await clientWrite
        .patch({
          // groq-global-scoped: ONE id, already proven to belong to this
          // conference by the caller, further narrowed to our own token.
          query:
            '*[_type == "sponsorForConference" && _id == $id && signatureId == $ours]',
          params: { id: sfc._id, ours: agreementId },
        })
        .unset(['signatureId', 'signingUrl', 'contractReservedAt'])
        .commit()
    } catch (error) {
      console.error('[contract-send] releasing the agreement failed:', error)
    }
  }

  return {
    action,
    release,
    signer,
    contractValue,
    appendHtml: contractCardHtml({ action, url: signingUrl, theme }),
    attachments: contractAttachments(action, signingUrl),
    // The email is out and the agreement is already stored: the deal moves
    // to contract-sent with a pending signature. If this write fails the link
    // still works; only the status is stale, and the organizer is told.
    afterSend: async () => {
      const actorId = actor.id ?? 'system'
      try {
        await clientWrite
          .patch(sfc._id)
          .set({
            contractStatus: 'contract-sent',
            contractSentAt: now,
            signatureStatus: 'pending',
            ...(args.organizerSignatureDataUrl && {
              organizerSignedAt: now,
              organizerSignedBy: organizerDisplayName,
            }),
          })
          .unset(['contractReservedAt'])
          .commit()
      } catch (error) {
        console.error('[contract-send] sponsor record update failed:', error)
        return { ok: false }
      }
      try {
        await logContractStatusChange(
          sfc._id,
          sfc.contractStatus,
          'contract-sent',
          actorId,
        )
        await logSignatureStatusChange(
          sfc._id,
          sfc.signatureStatus ?? 'not-started',
          'pending',
          actorId,
        )
      } catch (error) {
        console.error('[contract-send] activity log failed:', error)
      }
      // Sending a contract advances the deal to Won (forward-only, tier-guarded).
      try {
        const promotion = await promoteToClosedWonOnContract(
          sfc._id,
          { status: sfc.status, tier: sfc.tier },
          actorId,
        )
        if (promotion.promoted) {
          await publishSponsorStatusChange({
            conferenceId: conference._id,
            sponsorForConferenceId: sfc._id,
            previous: sfc,
            next: { status: 'closed-won' },
            source: 'crm.sendCommunication:contract',
            triggeredBy: actor.id ?? undefined,
          })
        }
      } catch (error) {
        console.error('[contract-send] closed-won promotion failed:', error)
      }
      return { ok: true }
    },
  }
}

type SystemReminderOutcome =
  | { ok: true; recipient: string }
  | {
      ok: false
      reason:
        | 'not-found'
        | 'not-pending'
        | 'signer-not-a-contact'
        | 'no-organization'
        | 'template-missing'
        | 'send-failed'
      message?: string
    }

/**
 * A signing reminder sent by the SYSTEM (the `contract-reminders` cron):
 * the same plan, template merge and send primitive an organizer's "Send
 * reminder" uses, with a `null` actor — so the record carries recipients,
 * body and provider id like any other send. The sponsor is read by id: this
 * is a cross-tenant sweep, and everything downstream — template, sender,
 * conference — comes off the sponsor's OWN conference, never from input.
 */
export async function sendContractReminderBySystem(
  sponsorForConferenceId: string,
): Promise<SystemReminderOutcome> {
  const { sponsorForConference: sfc } = await getSponsorForConference(
    sponsorForConferenceId,
  )
  if (!sfc) return { ok: false, reason: 'not-found' }
  if (contractActionFor(sfc) !== 'remind') {
    return { ok: false, reason: 'not-pending' }
  }
  const signer = sfc.contactPersons?.find(
    (c) => !!c.email && c.email === sfc.signerEmail,
  )
  if (!signer?._key) return { ok: false, reason: 'signer-not-a-contact' }
  const orgId = (sfc.conference as { organization?: { _ref?: string } })
    .organization?._ref
  if (!orgId) return { ok: false, reason: 'no-organization' }

  const { template } = await getSponsorEmailTemplateBySlugForOrg(
    orgId,
    'contract-reminder',
  )
  if (!template) return { ok: false, reason: 'template-missing' }

  const contractValue = formatContractValue(sfc)
  const variables = buildTemplateVariables({
    sponsorName: sfc.sponsor?.name ?? 'Sponsor',
    contactNames: signer.name,
    conference: {
      title: sfc.conference.title,
      startDate: sfc.conference.startDate,
      city: sfc.conference.city,
      organizer: sfc.conference.organizer,
      domains: sfc.conference.domains,
    },
    tierName: sfc.tier?.title,
    signerName: signer.name,
    signerEmail: signer.email,
    contractValue,
  })
  const subject = processTemplateVariables(template.subject, variables)
  const message = processPortableTextVariables(
    (template.body ?? []) as TemplateBlock[],
    variables,
  ) as unknown as PortableTextBlock[]

  // The expanded conference carries what the send renders with (title,
  // domains, sender, theme); the primitive's own sponsor read scopes by its id.
  const conference = sfc.conference as unknown as Conference
  const plan = await prepareContractSend({
    conference,
    sfc,
    recipientKeys: [signer._key],
    actor: { id: null },
  })
  const result = await sendSponsorCommunication({
    conference,
    orgId,
    actorId: null,
    sponsorForConferenceId,
    kind: 'contract',
    recipientKeys: [signer._key],
    subject,
    message,
    template,
    appendHtml: plan.appendHtml,
    attachments: plan.attachments,
    contractVariables: {
      signerName: signer.name,
      signerEmail: signer.email,
      contractValue,
    },
  })
  if (!result.ok) {
    return {
      ok: false,
      reason: 'send-failed',
      message: 'message' in result ? result.message : result.reason,
    }
  }
  await plan.afterSend()
  return { ok: true, recipient: signer.email }
}
