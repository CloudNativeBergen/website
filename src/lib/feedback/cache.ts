import { revalidateTag } from 'next/cache'
import { feedbackCodeIndexTag } from '@/lib/cache/tags'

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
