import 'server-only'
import { clientWrite } from '@/lib/sanity/client'
import { sanityStatus } from '@/lib/sanity/status'
import {
  AGAIN,
  atMostTwice,
  readWallPost,
  sameIncarnation,
  type StoredWallPost,
} from './wall-post'

/**
 * THE MARKETING SWITCH (Photo Wall spec §12): the contributor ticks or
 * unticks marketing consent on one of their own posts. ONE patch of
 * `marketingConsent`, guarded with `ifRevisionId` against the live read it
 * was decided from, so it never lands on a replacement a submit created
 * under the id after a Delete. On a conflict, re-read once and retry: a
 * moderation decision in between changes nothing about the consent, so the
 * retry goes ahead on the same post. Nothing here expires a cache tag: the
 * Server Action does, per §8.
 */

export type MarketingResult =
  | { status: 'done' }
  /** Conflicted twice; nothing written. The card refreshes. */
  | { status: 'changed' }
  /** No such post of this device on this wall (or a Delete in progress). */
  | { status: 'gone' }

/**
 * The post must be this device's (the ownership check is on the doc
 * endpoint's latest version, BEFORE any write; another device's or a missing
 * post is `gone` alike) and not `deleting`: a Delete in progress has no
 * switch.
 */
export async function setWallPostMarketing({
  conferenceId,
  postId,
  deviceKey,
  consent,
}: {
  conferenceId: string
  postId: string
  deviceKey: string
  consent: boolean
}): Promise<MarketingResult> {
  const read = async (): Promise<StoredWallPost | null> => {
    const post = await readWallPost(conferenceId, postId)
    if (!post || post.deviceKey !== deviceKey || post.status === 'deleting') {
      return null
    }
    return post
  }
  const first = await read()
  if (!first) return { status: 'gone' }

  return atMostTwice<MarketingResult>(
    async (attempt) => {
      let post = first
      if (attempt === 1) {
        const again = await read()
        if (!again || !sameIncarnation(again, first)) return { status: 'gone' }
        post = again
      }
      try {
        await clientWrite
          .patch(postId)
          .ifRevisionId(post._rev)
          .set({ marketingConsent: consent })
          .commit()
        return { status: 'done' }
      } catch (error) {
        if (sanityStatus(error) === 404) return { status: 'gone' }
        if (sanityStatus(error) === 409) return AGAIN
        throw error
      }
    },
    () => ({ status: 'changed' }),
  )
}
