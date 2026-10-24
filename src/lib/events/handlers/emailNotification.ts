import { ProposalStatusChangeEvent } from '@/lib/events/types'
import { sendAcceptRejectNotification } from '@/lib/proposal/server'
import { Action } from '@/lib/proposal/types'
import { formatDate } from '@/lib/time'
import { emailBrandColor } from '@/lib/branding/theme'

/** An organizer canceled or withdrew the talk (not a speaker's own withdrawal). */
export function isOrganizerRemoval(event: ProposalStatusChangeEvent): boolean {
  return (
    (event.action === Action.cancel || event.action === Action.withdraw) &&
    event.metadata.triggeredBy.isOrganizer
  )
}

/**
 * Whether the speaker gets the formal decision email (and, for accept/reject/
 * waitlist/remind, the in-app status notice). For an organizer cancel/withdraw
 * `shouldNotify` is the organizer's "Force email" tick; a speaker who withdraws
 * their own talk is never emailed about it.
 */
export function isSpeakerFacingDecision(
  event: ProposalStatusChangeEvent,
): boolean {
  if (!event.metadata.shouldNotify) return false
  if (event.action === Action.cancel || event.action === Action.withdraw) {
    return isOrganizerRemoval(event)
  }
  return [
    Action.accept,
    Action.reject,
    Action.waitlist,
    Action.remind,
  ].includes(event.action)
}

export async function handleEmailNotification(
  event: ProposalStatusChangeEvent,
): Promise<void> {
  if (!isSpeakerFacingDecision(event)) {
    return
  }

  if (!event.speakers || event.speakers.length === 0) {
    console.warn('No speakers found for email notification')
    return
  }

  // Notify every speaker on the proposal (primary speaker and co-speakers),
  // de-duplicated by email address (case-insensitive) to guard against dirty
  // data. The trimmed address is also what gets sent to, so the dedup key
  // and the recipient can never diverge.
  const seenEmails = new Set<string>()
  const recipients: Array<{ name: string; email: string }> = []
  // An organizer who is also a speaker on the talk they cancel/withdraw does
  // not email themselves.
  const skipId = isOrganizerRemoval(event)
    ? event.metadata.triggeredBy.speakerId
    : undefined
  for (const speaker of event.speakers) {
    if (skipId && speaker._id === skipId) continue
    const email = speaker.email?.trim()
    if (!email) {
      continue
    }
    const key = email.toLowerCase()
    if (seenEmails.has(key)) {
      continue
    }
    seenEmails.add(key)
    recipients.push({ name: speaker.name, email })
  }

  if (recipients.length === 0) {
    console.warn(
      `No speakers with email addresses found for proposal ${event.proposal._id}`,
    )
    return
  }

  const results = await Promise.allSettled(
    recipients.map((speaker) =>
      sendAcceptRejectNotification({
        action: event.action,
        speaker: {
          name: speaker.name,
          email: speaker.email,
        },
        proposal: {
          _id: event.proposal._id,
          title: event.proposal.title,
        },
        comment: event.metadata.comment || event.metadata.reason || '',
        event: {
          orgId: event.conference.organization?._ref,
          location: event.conference.city,
          date: formatDate(event.conference.startDate),
          name: event.conference.title,
          organizer: event.conference.organizer,
          url: `https://${event.metadata.domain}`,
          socialLinks: event.conference.socialLinks,
          contactEmail: event.conference.contactEmail,
          // THEMING L1: carry the tenant's brand primary into the mail accent.
          brandColor: emailBrandColor(event.conference.theme),
        },
      }),
    ),
  )

  const failures = results
    .map((result, index) => ({ result, speaker: recipients[index] }))
    .filter(
      (
        entry,
      ): entry is {
        result: PromiseRejectedResult
        speaker: { name: string; email: string }
      } => entry.result.status === 'rejected',
    )

  if (failures.length > 0) {
    console.warn(
      `Failed to send email notification to ${failures.length} of ${recipients.length} speaker(s) for proposal ${event.proposal._id}:`,
      failures.map(({ speaker, result }) => ({
        email: speaker.email,
        reason:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      })),
    )
  }

  const successCount = recipients.length - failures.length
  if (successCount > 0) {
    console.log(
      `Email notification sent to ${successCount} of ${recipients.length} speaker(s) for proposal ${event.proposal._id}`,
    )
  }
}
