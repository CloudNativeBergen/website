import {
  CoSpeakerInvitedEvent,
  ProposalStatusChangeEvent,
} from '@/lib/events/types'
import { Action } from '@/lib/proposal/types'
import {
  getSpeakerPushState,
  prunePushSubscription,
} from '@/lib/push/sanity'
import { sendPush } from '@/lib/push/send'
import {
  buildCoSpeakerInviteMessage,
  buildProposalStatusMessage,
  categoryForAction,
} from '@/lib/push/messages'
import type { PushCategory, PushMessagePayload } from '@/lib/push/types'
import { getSpeakerByEmail } from '@/lib/speaker/sanity'

/**
 * Web push event handler (issue #444). ADDITIVE to the existing email/Slack
 * notifications — those are unaffected. Runs fire-and-forget on the event bus,
 * isolated per handler; a failure here never blocks the status change.
 *
 * Delivery rules (enforced here, not by the caller):
 *   - only sends to subscriptions OWNED BY THE TARGET SPEAKER (no cross-user
 *     push — the subscription set is read fresh off that speaker's own doc);
 *   - only when the speaker's `pushPreferences` for the category is ON;
 *   - a 404/410 from the push service prunes that dead subscription.
 */

/**
 * Deliver one payload to every push subscription a speaker owns, gated by their
 * per-category preference. Prunes any subscription the push service reports as
 * permanently gone. Never throws.
 */
async function deliverToSpeaker(
  speakerId: string,
  category: PushCategory,
  payload: PushMessagePayload,
): Promise<void> {
  let state
  try {
    state = await getSpeakerPushState(speakerId)
  } catch (error) {
    console.error(`Failed to read push state for speaker ${speakerId}:`, error)
    return
  }

  if (!state.preferences[category]) {
    return
  }
  if (state.subscriptions.length === 0) {
    return
  }

  const results = await Promise.allSettled(
    state.subscriptions.map(async (subscription) => {
      const result = await sendPush(subscription, payload)
      if (result.gone) {
        await prunePushSubscription(speakerId, subscription.endpoint).catch(
          (error) => {
            console.error(
              `Failed to prune dead push subscription for speaker ${speakerId}:`,
              error,
            )
          },
        )
      }
      return result
    }),
  )

  const delivered = results.filter(
    (r) => r.status === 'fulfilled' && r.value.ok,
  ).length
  if (delivered > 0) {
    console.log(
      `Push notification (${category}) delivered to ${delivered} device(s) for speaker ${speakerId}`,
    )
  }
}

/** Handle a proposal status change: notify each affected speaker. */
export async function handlePushNotification(
  event: ProposalStatusChangeEvent,
): Promise<void> {
  const category = categoryForAction(event.action)
  if (!category) {
    return
  }

  // Mirror the email handler: an organizer decision (accept/reject/waitlist)
  // only pushes when they opted to notify. A self-service confirm always does.
  const isDecision = [Action.accept, Action.reject, Action.waitlist].includes(
    event.action,
  )
  if (isDecision && !event.metadata.shouldNotify) {
    return
  }

  const payload = buildProposalStatusMessage({
    action: event.action,
    proposalId: event.proposal._id,
    proposalTitle: event.proposal.title,
    conferenceTitle: event.conference.title,
  })
  if (!payload) {
    return
  }

  if (!event.speakers || event.speakers.length === 0) {
    return
  }

  // De-dupe by speaker id so a speaker listed twice is not notified twice.
  const seen = new Set<string>()
  await Promise.allSettled(
    event.speakers.map((speaker) => {
      if (!speaker?._id || seen.has(speaker._id)) {
        return Promise.resolve()
      }
      seen.add(speaker._id)
      return deliverToSpeaker(speaker._id, category, payload)
    }),
  )
}

/** Handle a co-speaker invitation: notify the invitee IF they have an account. */
export async function handleCoSpeakerInvitePush(
  event: CoSpeakerInvitedEvent,
): Promise<void> {
  let speaker
  try {
    const result = await getSpeakerByEmail(event.invitedEmail)
    speaker = result.speaker
  } catch (error) {
    console.error(
      'Failed to resolve invited speaker for push notification:',
      error,
    )
    return
  }

  // No account yet → no push. The invitation email still reaches them.
  if (!speaker?._id) {
    return
  }

  const payload = buildCoSpeakerInviteMessage({
    inviterName: event.invitedBy.name,
    proposalTitle: event.proposal.title,
  })

  await deliverToSpeaker(speaker._id, 'coSpeakerInvites', payload)
}
