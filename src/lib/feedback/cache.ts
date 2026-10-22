import { revalidateTag, updateTag } from 'next/cache'
import {
  conferenceTag,
  feedbackCodeIndexTag,
  feedbackResponseTag,
} from '@/lib/cache/tags'

/**
 * Expire the conference's Feedback Code index (speaker feedback spec §5.1)
 * with `{ expire: 0 }`, so a just-minted code resolves at once instead of
 * after the index's stale-while-revalidate refresh.
 *
 * Called AFTER the write commits, and NEVER FAILS the mutation it rides on:
 * `revalidateTag` throws outside a request scope, and a committed mint
 * reported as a failure would only make the speaker retry. A missed expiry is
 * recovered by the index's own `cacheLife`.
 */
export function expireFeedbackCodeIndex(conferenceId: string): void {
  const tag = feedbackCodeIndexTag(conferenceId)
  try {
    revalidateTag(tag, { expire: 0 })
  } catch (error) {
    console.error(`Could not expire the Feedback Code cache tag ${tag}`, error)
  }
}

/**
 * Refresh the programme's "Give feedback" links (#1472, spec §7.5) after a
 * code was minted or unset: the card's `hasFeedbackCode` rides the cached
 * conference read (`conferenceTag`), which the index's expiry never reaches,
 * so a morning-of bulk mint would otherwise show no link for hours.
 * Stale-while-revalidate (`'default'`), not `expire: 0`: the conference read
 * backs every public page, and a link appearing one request later is fine.
 * Rotation needs none: the link resolves the current code when followed.
 * Never fails the mutation it rides on.
 */
export function expireProgrammeFeedbackLinks(conferenceId: string): void {
  const tag = conferenceTag(conferenceId)
  try {
    revalidateTag(tag, 'default')
  } catch (error) {
    console.error(`Could not expire the conference cache tag ${tag}`, error)
  }
}

/**
 * Expire one device's own response as `/f/<code>` reads it (speaker feedback
 * spec §7.4), after Submit or Delete my answer wrote it. `updateTag`, which
 * only a Server Action may call: the next render of the page waits for the
 * new answer instead of serving the old one. Never fails the write it rides
 * on; a missed expiry is recovered by the read's own 5-minute `cacheLife`.
 */
export function expireFeedbackResponse(responseId: string): void {
  const tag = feedbackResponseTag(responseId)
  try {
    updateTag(tag)
  } catch (error) {
    console.error(
      `Could not expire the Feedback Response cache tag ${tag}`,
      error,
    )
  }
}

/**
 * Expire a REMOVED response as `/f/<code>` reads it (speaker feedback spec
 * §7.4, §10.3), so the page stops showing it as that device's answer.
 * `revalidateTag(tag, { expire: 0 })`, not `updateTag`: Remove runs in the
 * `/api/trpc` Route Handler, where `updateTag` throws. Never fails the
 * Remove it rides on; a missed expiry is recovered by the read's own
 * 5-minute `cacheLife`.
 */
export function expireRemovedFeedbackResponse(responseId: string): void {
  const tag = feedbackResponseTag(responseId)
  try {
    revalidateTag(tag, { expire: 0 })
  } catch (error) {
    console.error(
      `Could not expire the Feedback Response cache tag ${tag}`,
      error,
    )
  }
}
