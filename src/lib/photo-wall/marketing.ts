import 'server-only'
import { clientWrite } from '@/lib/sanity/client'
import { sanityStatus } from '@/lib/sanity/status'
import type { OnWrite } from './delete'
import type { ShownIncarnation } from './moderation'
import type { MyPostMarketingStatus } from './my-posts'
import {
  AGAIN,
  atMostTwice,
  isShown,
  readWallPost,
  sameIncarnation,
  type StoredWallPost,
} from './wall-post'

/**
 * THE MARKETING SWITCH (Photo Wall spec §12): the contributor ticks or
 * unticks marketing consent on one of their own posts, and an organizer's
 * Withdraw marketing OK unticks it on any post of the wall. ONE patch of
 * `marketingConsent`, guarded with `ifRevisionId` against the live read it
 * was decided from, so it never lands on a replacement a submit created
 * under the id after a Delete. On a conflict, re-read once and retry: a
 * moderation decision in between changes nothing about the consent, so the
 * retry goes ahead on the same post. Nothing here expires a cache tag: the
 * Server Action or the tRPC mutation does, per §8.
 */

/** `done` written; `changed` conflicted twice, nothing written; `gone` no such post of this device, or for an organizer of this wall as its card showed it (or a Delete in progress). */
export type MarketingResult = { status: MyPostMarketingStatus }

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
  onWrite,
}: {
  conferenceId: string
  postId: string
  deviceKey: string
  consent: boolean
  /** As `deleteWallPost`'s: see {@link OnWrite}. */
  onWrite?: OnWrite
}): Promise<MarketingResult> {
  return patchConsent({
    conferenceId,
    postId,
    consent,
    accepts: (post) => post.deviceKey === deviceKey,
    onWrite,
  })
}

/**
 * WITHDRAW MARKETING OK (§10, §12): an organizer honours a contributor's
 * withdrawal who no longer has the phone's cookie, without deleting the
 * post. It only ever writes `false`: an organizer never gives consent on a
 * contributor's behalf. Any device's post of this conference, but only the
 * one the card showed (`shown`, checked on the first read, as Delete now's),
 * and never a `deleting` one. The same guarded patch and retry as the
 * switch; `onRead` reports the device of each post it read, for the expiry.
 */
export async function withdrawWallPostMarketing({
  conferenceId,
  postId,
  shown,
  onRead,
  onWrite,
}: {
  conferenceId: string
  postId: string
  shown: ShownIncarnation
  onRead?: (deviceKey: string | null) => void
  /** As `deleteWallPost`'s: see {@link OnWrite}. */
  onWrite?: OnWrite
}): Promise<MarketingResult> {
  return patchConsent({
    conferenceId,
    postId,
    consent: false,
    accepts: () => true,
    shown,
    onRead,
    onWrite,
  })
}

async function patchConsent({
  conferenceId,
  postId,
  consent,
  accepts,
  shown,
  onRead,
  onWrite,
}: {
  conferenceId: string
  postId: string
  consent: boolean
  /** Whether this caller may write to the post. */
  accepts: (post: StoredWallPost) => boolean
  shown?: ShownIncarnation
  onRead?: (deviceKey: string | null) => void
  onWrite?: OnWrite
}): Promise<MarketingResult> {
  const read = async (): Promise<StoredWallPost | null> => {
    const post = await readWallPost(conferenceId, postId)
    if (!post || !accepts(post) || post.status === 'deleting') return null
    onRead?.(post.deviceKey)
    return post
  }
  const first = await read()
  if (!first || (shown && !isShown(first, shown))) return { status: 'gone' }

  return atMostTwice<MarketingResult>(
    async (attempt) => {
      let post = first
      if (attempt === 1) {
        const again = await read()
        if (!again || !sameIncarnation(again, first)) return { status: 'gone' }
        post = again
      }
      onWrite?.(true)
      try {
        await clientWrite
          .patch(postId)
          .ifRevisionId(post._rev)
          .set({ marketingConsent: consent })
          .commit()
        return { status: 'done' }
      } catch (error) {
        const status = sanityStatus(error)
        // Refused outright: nothing was written.
        if (status === 404 || status === 409) onWrite?.(false)
        if (status === 404) return { status: 'gone' }
        if (status === 409) return AGAIN
        throw error
      }
    },
    () => ({ status: 'changed' }),
  )
}
