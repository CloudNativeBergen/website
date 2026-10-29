import { ProposalStatusChangeEvent } from '@/lib/events/types'
import { Action } from '@/lib/proposal/types'
import {
  createNotifications,
  getOrganizerSpeakerIdsForOrg,
} from '@/lib/notification/sanity'
import { resolveRoutedOrganizerIds } from '@/lib/teams'
import type { NotificationInput } from '@/lib/notification/types'
// Same gate as the email, so a speaker is notified in-app exactly when they
// are emailed about a status change.
import {
  isOrganizerRemoval,
  isSpeakerFacingDecision,
} from './emailNotification'

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
  // The no-team fallback is the EVENT conference's organizers, not the request
  // host's: a foreign talk's event carries its own conference.
  const eventOrgOrganizerIds = () =>
    getOrganizerSpeakerIdsForOrg(event.conference.organization?._ref ?? null)

  if (event.action === Action.submit) {
    // TEAMS-2: proposal events route to the `cfp` team (all organizers when it
    // is not configured — the shared fallback contract).
    const organizerIds = await resolveRoutedOrganizerIds({
      conferenceId,
      teamKey: 'cfp',
      allOrganizerIds: await eventOrgOrganizerIds(),
    })
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

  if (
    event.action === Action.confirm ||
    event.action === Action.withdraw ||
    event.action === Action.cancel
  ) {
    // Organizer routing is unconditional (like submit) — it mirrors the Slack
    // organizer alert, not the email-gated speaker notification.
    const isWithdraw = event.action === Action.withdraw
    // TEAMS-2: proposal events route to the `cfp` team (all organizers when it
    // is not configured).
    const organizerIds = await resolveRoutedOrganizerIds({
      conferenceId,
      teamKey: 'cfp',
      allOrganizerIds: await eventOrgOrganizerIds(),
    })
    const title = isWithdraw
      ? `Proposal withdrawn: "${proposalTitle}"`
      : event.action === Action.cancel
        ? `Talk canceled: "${proposalTitle}"`
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
    // The fanned-out thread message already put a hub item in front of the
    // organizers; a status item on top would double-notify them.
    const isRemoval = event.action !== Action.confirm
    if (!(isRemoval && event.metadata.postedToThread)) {
      await createNotifications(items)
    }
    // No return: an organizer cancel/withdraw also notifies the speaker below.
  }

  // An organizer cancel/withdraw always tells the speakers in-app; the
  // formal email is the optional part.
  if (isOrganizerRemoval(event) || isSpeakerFacingDecision(event)) {
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
        message: event.metadata.comment || event.metadata.reason || undefined,
        actorId,
        relatedProposalId: proposalId,
        // When the decision carries a comment it is ALSO relayed into the
        // proposal's message thread; point the status notification at the same
        // #messages anchor as the message notification so the two bell rows lead
        // to the same place instead of diverging (batch A / A7).
        link:
          event.metadata.comment || event.metadata.postedToThread
            ? `/cfp/proposal/${proposalId}#messages`
            : `/cfp/proposal/${proposalId}`,
      })
    }
    await createNotifications(items)
  }
}
