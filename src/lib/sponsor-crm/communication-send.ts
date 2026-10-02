import 'server-only'
import { render } from '@react-email/render'
import type { PortableTextBlock } from '@portabletext/types'
import type { Conference } from '@/lib/conference/types'
import type { ContactPerson } from '@/lib/sponsor/types'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { resolveEmailSender, retryWithBackoff } from '@/lib/email/config'
import { resolveConferenceFrom } from '@/lib/email/from'
import {
  convertPortableTextToHTML,
  renderEmailTemplate,
} from '@/lib/email/route-helpers'
import { getCurrentDateTime } from '@/lib/time'
import { logCommunication, logStageChange } from './activity'
import { CommunicationRecipientError, resolveRecipients } from './communication'
import type {
  CommunicationAttachment,
  CommunicationKind,
  CommunicationRecipient,
} from './types'

export interface SendSponsorCommunicationArgs {
  conference: Conference
  /** The request's organization, from the authorization waist — never input. */
  orgId: string | null | undefined
  /** Organizer id, or `null` for an automated (cron) send. */
  actorId: string | null
  /** Already proven to belong to the current conference by the caller. */
  sponsorForConferenceId: string
  kind: CommunicationKind
  recipientKeys: readonly string[]
  subject: string
  message: PortableTextBlock[]
  template?: { id: string; edited: boolean }
  attachments?: CommunicationAttachment[]
}

export type SendSponsorCommunicationResult =
  | {
      ok: true
      activityId?: string
      providerMessageId?: string
      recipients: CommunicationRecipient[]
    }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'bad-recipients'; message: string }
  | { ok: false; reason: 'render-failed'; message: string }
  | {
      ok: false
      reason: 'send-failed'
      message: string
      activityId?: string
      recipients: CommunicationRecipient[]
    }

interface SfcForSend {
  _id: string
  status: string
  contactInitiatedAt?: string
  outreachCount?: number
  contactPersons?: ContactPerson[]
}

/**
 * THE one way a sponsor email leaves the system (#1261). Resolves recipients
 * from contact keys, renders the exact HTML that is sent, sends it through
 * the tenant's sender, and writes the audit record — for a failure too.
 *
 * Never-fail contract on the record: the activity write is best-effort and
 * can neither fail nor roll back a send that the provider already accepted.
 */
export async function sendSponsorCommunication(
  args: SendSponsorCommunicationArgs,
): Promise<SendSponsorCommunicationResult> {
  const { conference, kind } = args

  const sfc = await clientReadUncached.fetch<SfcForSend | null>(
    `*[_type == "sponsorForConference" && _id == $sfcId && conference._ref == $conferenceId][0]{
      _id, status, contactInitiatedAt, outreachCount,
      contactPersons[]{ _key, name, email, role, isPrimary }
    }`,
    { sfcId: args.sponsorForConferenceId, conferenceId: conference._id },
  )
  if (!sfc) return { ok: false, reason: 'not-found' }

  let recipients: CommunicationRecipient[]
  try {
    recipients = resolveRecipients(sfc.contactPersons, args.recipientKeys)
  } catch (error) {
    if (error instanceof CommunicationRecipientError) {
      return { ok: false, reason: 'bad-recipients', message: error.message }
    }
    throw error
  }

  const { htmlContent, error: htmlError } = await convertPortableTextToHTML(
    args.message,
    conference,
  )
  if (htmlError || !htmlContent) {
    return {
      ok: false,
      reason: 'render-failed',
      message: 'Failed to convert message to HTML',
    }
  }
  // Rendered ONCE to a string: the same bytes go to the provider and into the
  // audit record, so "body as sent" is literally true.
  const html = await render(
    renderEmailTemplate({
      conference,
      subject: args.subject,
      htmlContent,
      unsubscribeUrl: undefined,
    }),
  )

  const from = resolveConferenceFrom(conference, {
    field: 'sponsorEmail',
    localPart: 'sponsors',
  })

  const record = {
    sponsorForConferenceId: sfc._id,
    kind,
    recipients,
    subject: args.subject,
    body: html,
    template: args.template,
    attachments: args.attachments,
    createdBy: args.actorId,
  }

  let providerMessageId: string | undefined
  try {
    const { client } = await resolveEmailSender(args.orgId)
    // Resend reports failures as a RESOLVED `{ error }` (including 429), so the
    // throw has to happen INSIDE the callback or `retryWithBackoff` never sees
    // a retryable failure and every send gets exactly one attempt.
    const result = await retryWithBackoff(async () => {
      const r = await client.emails.send({
        from,
        to: recipients.map((r) => r.email),
        subject: args.subject,
        html,
      })
      if (r.error) {
        throw Object.assign(new Error(r.error.message), {
          status: (r.error as { statusCode?: number }).statusCode,
        })
      }
      return r
    })
    providerMessageId = result.data?.id
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const { activityId } = await logCommunication({
      ...record,
      deliveryStatus: 'failed',
      error: message,
    })
    return { ok: false, reason: 'send-failed', message, activityId, recipients }
  }

  const { activityId } = await logCommunication({
    ...record,
    deliveryStatus: 'sent',
    providerMessageId,
  })

  if (kind === 'information') {
    await trackOutreach(sfc, args.actorId)
  }

  return { ok: true, activityId, providerMessageId, recipients }
}

/**
 * First-contact bookkeeping the old `sendEmail` did: stamp the first outreach,
 * count it, and move a prospect to contacted. Best-effort, like the record.
 */
async function trackOutreach(sfc: SfcForSend, actorId: string | null) {
  try {
    const patch = clientWrite.patch(sfc._id)
    if (!sfc.contactInitiatedAt) {
      patch.set({ contactInitiatedAt: getCurrentDateTime() })
    }
    patch.set({ outreachCount: (sfc.outreachCount || 0) + 1 })
    if (sfc.status === 'prospect') patch.set({ status: 'contacted' })
    await patch.commit()
    if (sfc.status === 'prospect') {
      await logStageChange(
        sfc._id,
        'prospect',
        'contacted',
        actorId ?? 'system',
      )
    }
  } catch (error) {
    console.error('[sendSponsorCommunication] outreach tracking failed:', error)
  }
}
