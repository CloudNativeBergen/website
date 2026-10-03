import 'server-only'
import { TRPCError } from '@trpc/server'
import { canonicalEmail } from '@/lib/speaker/email'
import { createHash } from 'node:crypto'
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
  /** Reminder from the cron: the persisted signer when they are no longer a contact. */
  serverRecipients?: readonly CommunicationRecipient[]
  /** First send only: which recipient signs. Defaults to the stored signer, then the primary contact. */
  signerKey?: string
  /** The action the composer was opened for; a mismatch with the current state is refused. */
  expectedAction?: ContractAction
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
  /**
   * The recipients as resolved HERE, against the sponsor the plan read. The
   * send must use these rather than re-resolve the keys: a contact's address
   * changed in between would receive a bearer link issued to someone else.
   */
  recipients: CommunicationRecipient[]
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

/** Every input the contract PDF renders from — the one list, used for the PDF and its fingerprint. */
function contractRenderInputs(
  sfc: SponsorForConferenceExpanded,
  signer: Pick<CommunicationRecipient, 'name' | 'email'>,
) {
  const primaryContact =
    sfc.contactPersons?.find((c) => c.isPrimary) ?? sfc.contactPersons?.[0]
  return {
    sponsor: {
      name: sfc.sponsor?.name ?? '',
      orgNumber: sfc.sponsor?.orgNumber,
      address: sfc.sponsor?.address,
      website: sfc.sponsor?.website,
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
      title: sfc.conference?.title ?? '',
      startDate: sfc.conference?.startDate,
      endDate: sfc.conference?.endDate,
      city: sfc.conference?.city,
      organizer: sfc.conference?.organizer,
      organizerOrgNumber: sfc.conference?.organizerOrgNumber,
      organizerAddress: sfc.conference?.organizerAddress,
      venueName: sfc.conference?.venueName,
      venueAddress: sfc.conference?.venueAddress,
      sponsorEmail: sfc.conference?.sponsorEmail,
      logoBright: sfc.conference?.logoBright,
    },
  }
}

/**
 * A fingerprint of everything a reserved PDF was rendered from — the inputs
 * above plus the template's identity and revision. A stale reservation is
 * reused only while it still matches: a corrected org number, a renamed
 * tier, an edited template all make it a different agreement.
 */
export function contractRenderFingerprint(
  sfc: SponsorForConferenceExpanded,
  signer: Pick<CommunicationRecipient, 'name' | 'email'>,
  template: { _id: string; _updatedAt?: string },
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        template: { _id: template._id, _updatedAt: template._updatedAt },
        inputs: contractRenderInputs(sfc, signer),
      }),
    )
    .digest('hex')
}

/**
 * Same address, whatever form it was stored in: recipients are canonical
 * (trimmed, lowercased), a `signerEmail` written by the removed sender may
 * not be.
 */
function sameEmail(a: string | null | undefined, b: string | null | undefined) {
  return !!a && !!b && canonicalEmail(a) === canonicalEmail(b)
}

/**
 * The persisted signer as a server-built recipient, for when they are not
 * among the sponsor's contacts (an external signer the old sender allowed, or
 * a contact since removed): the reminder and the signed copy are theirs.
 */
function persistedSignerRecipient(
  sfc: SponsorForConferenceExpanded,
): CommunicationRecipient | null {
  if (!sfc.signerEmail) return null
  return {
    contactKey: 'signer-external',
    name:
      sfc.signerName ?? sfc.sponsor?.name ?? canonicalEmail(sfc.signerEmail),
    email: canonicalEmail(sfc.signerEmail),
    isDefault: false,
  }
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
    recipients.find((r) => sameEmail(r.email, sfc.signerEmail)) ??
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
  const action = contractActionFor(sfc)
  if (args.expectedAction && args.expectedAction !== action) {
    throw precondition(
      'The contract state changed since this email was composed. Close it, reload the sponsor and send again.',
    )
  }
  // The reminder and the signed copy go to the signer on record, whether
  // or not they are (still) a contact and whether or not they were ticked:
  // the server adds them, never silently drops them for whoever is chosen.
  const signerOnRecord =
    action !== 'send' ? persistedSignerRecipient(sfc) : null
  let recipients: CommunicationRecipient[]
  try {
    recipients = [
      ...(args.recipientKeys.length > 0 ||
      (!args.serverRecipients?.length && !signerOnRecord)
        ? resolveRecipients(sfc.contactPersons, args.recipientKeys)
        : []),
      ...(args.serverRecipients ?? []),
    ]
  } catch (error) {
    if (error instanceof CommunicationRecipientError) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: error.message })
    }
    throw error
  }
  if (
    signerOnRecord &&
    !recipients.some((r) => sameEmail(r.email, signerOnRecord.email))
  ) {
    recipients = [...recipients, signerOnRecord]
  }
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
      recipients,
      // The person who signed — merged as SIGNER_NAME in the confirmation.
      signer: recipients.find((r) => sameEmail(r.email, sfc.signerEmail)) ?? {
        contactKey: '',
        name: sfc.signerName ?? sfc.sponsor?.name ?? sfc.signerEmail ?? '',
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
      recipients.find((r) => sameEmail(r.email, sfc.signerEmail)) ??
      ({
        contactKey: '',
        name: sfc.signerName ?? sfc.sponsor?.name ?? sfc.signerEmail ?? '',
        email: sfc.signerEmail ?? '',
        isDefault: false,
      } satisfies CommunicationRecipient)
    return {
      action,
      recipients,
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
  let signer = pickSigner(sfc, recipients, args.signerKey)
  // Counter-signing is the assigned organizer's alone — checked before any
  // path, so a reused agreement can never be stamped by someone else.
  if (args.organizerSignatureDataUrl) {
    if (!actor.id || sfc.assignedTo?._id !== actor.id) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only the assigned organizer can counter-sign this contract.',
      })
    }
  }

  const now = getCurrentDateTime()
  const organizerDisplayName =
    actor.name?.trim() || actor.email?.trim() || 'Organizer'
  // The template, resolved up front: its identity and revision are part of
  // the fingerprint a stale reservation is judged against.
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
  const renderInputs = contractRenderFingerprint(sfc, signer, template)
  // RESERVE the agreement before anything is mailed: the signing page resolves
  // the token through the stored `signatureId`, so a link that is emailed
  // before it is stored would be dead if the store failed — and two first
  // sends racing would overwrite each other's token. Decided on a fresh read,
  // BEFORE any costly work: refused (nothing mailed) when a contract is
  // already out, or when another send reserved within the settle window; a
  // reservation older than the window (a send that crashed or whose status
  // flip failed after mailing) is REUSED, so the link already in an inbox
  // stays the stored one and no second agreement is minted.
  // The terms the PDF renders from, as a fingerprint stored with the
  // reservation: a reserved PDF whose terms have since changed is not reused.
  const addonIds = (sfc.addons ?? [])
    .map((a) => a._id)
    .sort()
    .join(',')
  const terms = `${sfc.contractValue ?? ''}|${sfc.contractCurrency ?? ''}|${sfc.tier?._id ?? ''}|${addonIds}`
  const current = await clientReadUncached.fetch<{
    _rev: string
    contractStatus: string | null
    signatureStatus: string | null
    signatureId: string | null
    signingUrl: string | null
    contractReservedAt: string | null
    contractReservedTerms: string | null
    contractReservedInputs: string | null
    contractValue: number | null
    contractCurrency: string | null
    status: string | null
    signerEmail: string | null
    assignedToId: string | null
    templateId: string | null
    contractSentAt: string | null
    contractDocument: Record<string, unknown> | null
    contractTemplate: Record<string, unknown> | null
    signerName: string | null
    organizerSignedAt: string | null
    organizerSignedBy: string | null
    tierId: string | null
    addonIds: string[] | null
  } | null>(
    `*[_type == "sponsorForConference" && _id == $id && conference._ref == $conferenceId][0]{ _rev, contractStatus, signatureStatus, signatureId, signingUrl, contractReservedAt, contractReservedTerms, contractReservedInputs, contractValue, contractCurrency, status, signerEmail, "assignedToId": assignedTo._ref, "templateId": contractTemplate._ref, contractSentAt, contractDocument, contractTemplate, signerName, organizerSignedAt, organizerSignedBy, "tierId": tier._ref, "addonIds": addons[]._ref }`,
    { id: sfc._id, conferenceId: conference._id },
  )
  if (!current || contractActionFor(current) !== 'send') {
    throw precondition(
      'A contract was just sent to this sponsor by someone else. Reload to see it.',
    )
  }
  // The PDF renders from the sponsor as it was read for this request; the
  // revision that guards the reservation is this later read's. The two must
  // agree on the terms, or a PDF with stale terms would be stored and sent.
  if (
    (current.contractValue ?? null) !== (sfc.contractValue ?? null) ||
    (current.contractCurrency ?? null) !== (sfc.contractCurrency ?? null) ||
    (current.tierId ?? null) !== (sfc.tier?._id ?? null) ||
    [...(current.addonIds ?? [])].sort().join(',') !== addonIds
  ) {
    throw precondition(
      'The sponsor’s tier, add-ons or contract value changed since this email was composed. Close it, reload the sponsor and send again.',
    )
  }
  // The state machine decides on the CURRENT record too (a deal closed since
  // the request's read must not receive a live agreement), bound to the
  // revision the reservation will be conditioned on.
  const freshGate = checkState('contract', 'contract-sent', {
    status: current.status ?? undefined,
    contractStatus: current.contractStatus ?? undefined,
    signatureStatus: current.signatureStatus ?? undefined,
    tier: current.tierId ? { _id: current.tierId } : null,
    contractValue: current.contractValue ?? undefined,
  })
  if (!freshGate.ok) throw preconditionFailed(freshGate.missing)
  // The assignment is re-checked on the revision the reservation binds to:
  // a sponsor reassigned since the request's read must not be countersigned
  // by the organizer it was taken from.
  if (args.organizerSignatureDataUrl && current.assignedToId !== actor.id) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the assigned organizer can counter-sign this contract.',
    })
  }
  // A reservation is an agreement stored but never flipped: its in-flight
  // marker is still set. A rejected or expired agreement went through the
  // flip (no marker) and gets a FRESH agreement with the current terms.
  // …and a revoked one (rejected/expired since it was stored) is never
  // reused either: the next explicit send issues a fresh agreement.
  // Another send is IN FLIGHT (a reservation younger than the settle window):
  // refused outright, whatever its terms or status.
  const stored = !!current.signatureId && !!current.signingUrl
  if (
    stored &&
    current.contractReservedAt &&
    Date.now() - new Date(current.contractReservedAt).getTime() <
      RESERVATION_SETTLE_MS
  ) {
    throw precondition(IN_FLIGHT_MESSAGE)
  }
  // A stale reservation is REUSED only if it is still the agreement for these
  // terms, was not revoked since, still names who it was issued to — an
  // agreement whose signer was cleared is replaced, never handed to someone —
  // and was rendered from the template the organizer asks for now (a
  // different template chosen on retry is a different agreement).
  const reserved =
    stored &&
    !!current.contractReservedAt &&
    current.signatureStatus !== 'rejected' &&
    current.signatureStatus !== 'expired' &&
    current.contractReservedTerms === terms &&
    current.contractReservedInputs === renderInputs &&
    !!current.signerEmail &&
    (!args.contractTemplateId || args.contractTemplateId === current.templateId)
  let signingUrl: string
  let agreementId: string
  let reservation: Record<string, unknown>
  const priorReservedAt = current.contractReservedAt
  // The agreement a FRESH one replaces — everything it overwrites. A refused
  // replacement puts it back whole: the link already in an inbox (a stale
  // reservation whose terms changed, or a rejected one) must not die for a
  // replacement that was never delivered.
  const priorAgreement: Record<string, unknown> = {
    signatureId: current.signatureId,
    signingUrl: current.signingUrl,
    contractReservedAt: current.contractReservedAt,
    contractReservedTerms: current.contractReservedTerms,
    contractReservedInputs: current.contractReservedInputs,
    contractSentAt: current.contractSentAt,
    contractDocument: current.contractDocument,
    contractTemplate: current.contractTemplate,
    signerName: current.signerName,
    signerEmail: current.signerEmail,
    organizerSignedAt: current.organizerSignedAt,
    organizerSignedBy: current.organizerSignedBy,
    // The status the replacement superseded (rejected / expired / not-started).
    signatureStatus: current.signatureStatus ?? 'not-started',
  }
  // Provenance follows the PDF that was actually embedded: a reused
  // agreement keeps its stored document, so no counter-signature is stamped.
  const countersigned = !reserved && !!args.organizerSignatureDataUrl
  if (reserved) {
    // The agreement was issued to the persisted signer; it cannot change
    // hands without a new agreement, and that signer must be among the
    // recipients (never silently swapped in for someone the organizer chose).
    // The persisted signer is the one on the reservation's own revision.
    const issuedTo = current.signerEmail!
    const persisted = recipients.find((r) => sameEmail(r.email, issuedTo))
    if (!persisted || !sameEmail(signer.email, issuedTo)) {
      throw precondition(
        `This agreement was already issued to ${issuedTo}. Include them as a recipient and the signer to send it again.`,
      )
    }
    signer = persisted
    signingUrl = current.signingUrl!
    agreementId = current.signatureId!
    reservation = { contractReservedAt: now }
  } else {
    let pdfBuffer: Buffer
    try {
      pdfBuffer = await generateContractPdf(
        template,
        contractRenderInputs(sfc, signer),
      )
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
      contractReservedTerms: terms,
      contractReservedInputs: renderInputs,
      // This agreement's own issuance time, from the moment it is signable:
      // the signing certificate embeds it, and the sponsor may sign before
      // the email lands (or before the flip, which stamps it again).
      contractSentAt: now,
      // A replacement for a rejected or expired agreement is signable from
      // the moment it is stored, like an initial send — the signing page
      // refuses rejected/expired, and the flip may still fail after mailing.
      signatureStatus: 'not-started',
      // Provenance travels WITH the PDF it was embedded in, so a reuse after
      // a failed flip keeps it.
      ...(countersigned && {
        organizerSignedAt: now,
        organizerSignedBy: organizerDisplayName,
      }),
    }
  }

  try {
    await clientWrite
      .patch(sfc._id)
      .ifRevisionId(current._rev)
      .set(reservation)
      // A fresh, unsigned PDF carries no sponsor signature, and no organizer
      // counter-signature unless one was embedded NOW: the previous
      // agreement's provenance must not survive onto it.
      .unset(
        reserved
          ? []
          : [
              'contractSignedAt',
              'contractSignedBy',
              ...(countersigned
                ? []
                : ['organizerSignedAt', 'organizerSignedBy']),
            ],
      )
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
      // Only this send's token, this attempt's reservation, and — for a
      // fresh agreement — only while nothing happened to it since (a
      // signature or a revocation through the link must stand). A REUSED
      // agreement was already delivered by an earlier email, so it stays;
      // only its in-flight marker goes back to what it was.
      await clientWrite
        .patch({
          query: reserved
            ? '*[_type == "sponsorForConference" && _id == $id && conference._ref == $conferenceId && signatureId == $ours && contractReservedAt == $reservedAt]'
            : '*[_type == "sponsorForConference" && _id == $id && conference._ref == $conferenceId && signatureId == $ours && contractReservedAt == $reservedAt && signatureStatus == "not-started"]',
          params: {
            id: sfc._id,
            conferenceId: conference._id,
            ours: agreementId,
            reservedAt: now,
          },
        })
        .unset(
          reserved
            ? []
            : Object.keys(priorAgreement).filter(
                (k) => priorAgreement[k] == null,
              ),
        )
        .set(
          reserved
            ? { contractReservedAt: priorReservedAt }
            : Object.fromEntries(
                Object.entries(priorAgreement).filter(([, v]) => v != null),
              ),
        )
        .commit()
    } catch (error) {
      console.error('[contract-send] releasing the agreement failed:', error)
    }
  }

  return {
    action,
    recipients,
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
        // Conditional on the CURRENT state: the reserved link is live from
        // the moment it is stored, so the sponsor may already have signed
        // through it while the provider was busy — that signature must never
        // be flipped back to pending. And only our own agreement is flipped.
        const latest = await clientReadUncached.fetch<{
          _rev: string
          contractStatus: string | null
          signatureStatus: string | null
          signatureId: string | null
          status: string | null
          tier: { _id: string } | null
          contractValue: number | null
        } | null>(
          `*[_type == "sponsorForConference" && _id == $id && conference._ref == $conferenceId][0]{ _rev, contractStatus, signatureStatus, signatureId, status, tier->{ _id }, contractValue }`,
          { id: sfc._id, conferenceId: conference._id },
        )
        if (!latest || latest.signatureId !== agreementId) {
          console.error(
            '[contract-send] the stored agreement is no longer this send’s; status left as is:',
            agreementId,
          )
          return { ok: false }
        }
        // The reservation stored this agreement as not-started; a rejected or
        // expired status now is a REVOCATION made since (an organizer acting
        // during the send), which the flip must never undo.
        if (
          latest.signatureStatus === 'rejected' ||
          latest.signatureStatus === 'expired'
        ) {
          console.error(
            '[contract-send] the agreement was revoked during the send; status left as is:',
            agreementId,
          )
          return { ok: false }
        }
        if (
          latest.signatureStatus === 'signed' ||
          latest.contractStatus === 'contract-signed'
        ) {
          // Signed already — through the link this send mailed. Nothing to
          // flip; the signing flow recorded it.
          await clientWrite
            .patch(sfc._id)
            .unset(['contractReservedAt'])
            .commit()
          return { ok: true }
        }
        // The state machine decides the transition on the CURRENT record: a
        // deal moved to closed-lost, or stripped of its tier or value, while
        // the provider was busy is not moved to contract-sent.
        const gate = checkState('contract', 'contract-sent', {
          status: latest.status ?? undefined,
          contractStatus: latest.contractStatus ?? undefined,
          signatureStatus: latest.signatureStatus ?? undefined,
          tier: latest.tier ?? undefined,
          contractValue: latest.contractValue ?? undefined,
        })
        if (!gate.ok) {
          console.error(
            '[contract-send] the deal no longer allows contract-sent; the mailed agreement is revoked:',
            gate.missing.map((m) => m.label),
          )
          // The link is in an inbox but the deal cannot take a signature
          // any more: the agreement is expired (the signing page refuses
          // it), on the same revision the gate judged.
          await clientWrite
            .patch(sfc._id)
            .ifRevisionId(latest._rev)
            .set({ signatureStatus: 'expired' })
            .unset([
              'contractReservedAt',
              'contractReservedTerms',
              'contractReservedInputs',
            ])
            .commit()
          return { ok: false }
        }
        await clientWrite
          .patch(sfc._id)
          .ifRevisionId(latest._rev)
          // The issuance time was stamped with the reservation: a reused
          // agreement keeps the date it was first issued on, the certificate
          // reads it.
          .set({
            contractStatus: 'contract-sent',
            signatureStatus: 'pending',
          })
          .unset([
            'contractReservedAt',
            'contractReservedTerms',
            'contractReservedInputs',
          ])
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
        | 'no-signer'
        | 'no-organization'
        | 'template-missing'
        | 'send-failed'
        | 'count-failed'
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
  // The reminder goes to the PERSISTED signer: the address the agreement was
  // sent to. Usually a contact; when not (an external signer the old sender
  // allowed, or a contact since removed), the server adds them itself.
  if (!sfc.signerEmail) return { ok: false, reason: 'no-signer' }
  const signerContact = sfc.contactPersons?.find((c) =>
    sameEmail(c.email, sfc.signerEmail),
  )
  // Canonical either way: the one form the erasure read can match (#1265).
  const signer: CommunicationRecipient = signerContact?._key
    ? {
        contactKey: signerContact._key,
        name: signerContact.name,
        email: canonicalEmail(signerContact.email),
        isDefault: !!signerContact.isPrimary,
      }
    : persistedSignerRecipient(sfc)!
  // Always the persisted address, as a server-built recipient: a contact key
  // re-resolved by the primitive could point at an address changed since.
  const recipientKeys: string[] = []
  const serverRecipients = [signer]
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
    recipientKeys,
    serverRecipients,
    actor: { id: null },
  })
  const result = await sendSponsorCommunication({
    conference,
    orgId,
    actorId: null,
    sponsorForConferenceId,
    kind: 'contract',
    recipientKeys,
    serverRecipients,
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
  // The email is out either way; a count that did not land is reported, not
  // hidden — an uncounted reminder is one the sweep will send again.
  const after = await plan.afterSend()
  if (!after.ok) {
    return {
      ok: false,
      reason: 'count-failed',
      message: `mailed to ${signer.email}, but reminderCount was not updated`,
    }
  }
  return { ok: true, recipient: signer.email }
}
