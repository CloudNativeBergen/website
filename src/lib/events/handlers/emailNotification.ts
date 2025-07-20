import { ProposalStatusChangeEvent } from '@/lib/events/types'
import { sendAcceptRejectNotification } from '@/lib/proposal/notification'
import { Action } from '@/lib/proposal/types'
import { formatDate } from '@/lib/time'

/**
 * Handler for email notifications to speakers
 */
export async function handleEmailNotification(
  event: ProposalStatusChangeEvent,
): Promise<void> {
  // Only send email notifications for specific actions and when requested
  if (
    !event.metadata.shouldNotify ||
    ![Action.accept, Action.reject, Action.remind].includes(event.action)
  ) {
    return
  }

  if (!event.speakers || event.speakers.length === 0) {
    console.warn('No speakers found for email notification')
    return
  }

  const primarySpeaker = event.speakers[0]

  await sendAcceptRejectNotification({
    action: event.action,
    speaker: {
      name: primarySpeaker.name,
      email: primarySpeaker.email,
    },
    proposal: {
      _id: event.proposal._id,
      title: event.proposal.title,
    },
    comment: event.metadata.comment || '',
    event: {
      location: event.conference.city,
      date: formatDate(event.conference.start_date),
      name: event.conference.title,
      url: event.conference.domains?.[0] ?? '',
      socialLinks: event.conference.social_links,
    },
  })

  console.log(`Email notification sent for proposal ${event.proposal._id}`)
}
