import { ProposalStatusChangeEvent } from '@/lib/events/types'
import { Action } from '@/lib/proposal/types'
import {
  createNotifications,
  getOrganizerSpeakerIds,
} from '@/lib/notification/sanity'
import type { NotificationInput } from '@/lib/notification/types'

/**
 * The set of actions that produce a speaker-facing status notification. Mirrors
 * the gating in `handleEmailNotification` (accept / reject / waitlist / remind)
 * so the in-app notification and the email stay in lockstep — a speaker is
 * notified in-app exactly when they'd be emailed about a status change.
 */
const SPEAKER_NOTIFY_ACTIONS: readonly Action[] = [
  Action.accept,
  Action.reject,
  Action.waitlist,
  Action.remind,
]

/**
 * Persists in-app notifications when a proposal's status changes.
 *
 * - `submit`: notify every organizer (except the actor) that a new proposal
 *   arrived.
 * - `confirm` / `withdraw`: notify every organizer (except the actor) that a
 *   speaker confirmed or withdrew — mirrors the Slack organizer alert
 *   (`slackNotification.ts`), which the in-app hub previously lacked.
 * - status change (mirroring the email handler's gating): notify each speaker
 *   on the proposal (except the actor) of the new status.
 *
 * All fan-out goes through `createNotifications`, which never throws — a failed
 * notification write must not fail the proposal mutation.
 */
export async function handlePersistNotification(
  event: ProposalStatusChangeEvent,
): Promise<void> {
  const actorId = event.metadata.triggeredBy?.speakerId
  const conferenceId = event.conference._id
  const proposalId = event.proposal._id
  const proposalTitle = event.proposal.title

  if (event.action === Action.submit) {
    const organizerIds = await getOrganizerSpeakerIds()
    const items: NotificationInput[] = organizerIds
      .filter((id) => id && id !== actorId)
      .map((id): NotificationInput => ({
        recipientId: id,
        conferenceId,
        notificationType: 'proposal_submitted',
        title: `New proposal: "${proposalTitle}"`,
        actorId,
        relatedProposalId: proposalId,
        link: `/admin/proposals/${proposalId}`,
      }))
    await createNotifications(items)
    return
  }

  if (event.action === Action.confirm || event.action === Action.withdraw) {
    // Organizer routing is unconditional (like submit) — it mirrors the Slack
    // organizer alert, not the email-gated speaker notification.
    const isWithdraw = event.action === Action.withdraw
    const organizerIds = await getOrganizerSpeakerIds()
    const title = isWithdraw
      ? `Proposal withdrawn: "${proposalTitle}"`
      : `Speaker confirmed: "${proposalTitle}"`
    // The mandatory withdrawal reason (#212) becomes the message when present.
    const message =
      isWithdraw && event.metadata.reason ? event.metadata.reason : undefined
    const items: NotificationInput[] = organizerIds
      .filter((id) => id && id !== actorId)
      .map((id): NotificationInput => ({
        recipientId: id,
        conferenceId,
        notificationType: 'proposal_status_changed',
        title,
        message,
        actorId,
        relatedProposalId: proposalId,
        link: `/admin/proposals/${proposalId}`,
      }))
    await createNotifications(items)
    return
  }

  if (
    event.metadata.shouldNotify &&
    SPEAKER_NOTIFY_ACTIONS.includes(event.action)
  ) {
    // De-duplicate by speaker id in case a proposal carries a duplicated
    // speaker, and skip the actor (they triggered the change themselves).
    const seen = new Set<string>()
    const items: NotificationInput[] = []
    for (const speaker of event.speakers || []) {
      const id = speaker?._id
      if (!id || id === actorId || seen.has(id)) {
        continue
      }
      seen.add(id)
      items.push({
        recipientId: id,
        conferenceId,
        notificationType: 'proposal_status_changed',
        title: `Your proposal "${proposalTitle}" is now ${event.newStatus}`,
        message: event.metadata.comment || undefined,
        actorId,
        relatedProposalId: proposalId,
        link: `/cfp/proposal/${proposalId}`,
      })
    }
    await createNotifications(items)
  }
}
