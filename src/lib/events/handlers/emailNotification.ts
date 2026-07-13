import { ProposalStatusChangeEvent } from '@/lib/events/types'
import { Speaker } from '@/lib/speaker/types'
import { sendAcceptRejectNotification } from '@/lib/proposal/server'
import { Action } from '@/lib/proposal/types'
import { formatDate } from '@/lib/time'

export async function handleEmailNotification(
  event: ProposalStatusChangeEvent,
): Promise<void> {
  if (
    !event.metadata.shouldNotify ||
    ![Action.accept, Action.reject, Action.waitlist, Action.remind].includes(
      event.action,
    )
  ) {
    return
  }

  if (!event.speakers || event.speakers.length === 0) {
    console.warn('No speakers found for email notification')
    return
  }

  // Notify every speaker on the proposal (primary speaker and co-speakers),
  // de-duplicated by email address (case-insensitive) to guard against dirty data.
  const seenEmails = new Set<string>()
  const recipients = event.speakers.filter((speaker) => {
    if (!speaker.email) {
      return false
    }
    const normalizedEmail = speaker.email.trim().toLowerCase()
    if (!normalizedEmail || seenEmails.has(normalizedEmail)) {
      return false
    }
    seenEmails.add(normalizedEmail)
    return true
  })

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
        comment: event.metadata.comment || '',
        event: {
          location: event.conference.city,
          date: formatDate(event.conference.startDate),
          name: event.conference.title,
          organizer: event.conference.organizer,
          url: `https://${event.metadata.domain}`,
          socialLinks: event.conference.socialLinks,
          contactEmail: event.conference.contactEmail,
        },
      }),
    ),
  )

  const failures = results
    .map((result, index) => ({ result, speaker: recipients[index] }))
    .filter(
      (entry): entry is { result: PromiseRejectedResult; speaker: Speaker } =>
        entry.result.status === 'rejected',
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
