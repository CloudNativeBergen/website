'use server'

import { cookies } from 'next/headers'
import {
  getMyPosts as readCachedMyPosts,
  getPhotoWall,
  updateWallPostTags,
} from '@/lib/photo-wall/cache'
import { deleteWallPost } from '@/lib/photo-wall/delete'
import { deletionDateEnd } from '@/lib/photo-wall/deletion'
import { issueWallDevice, wallDeviceCookie } from '@/lib/photo-wall/device'
import { setWallPostMarketing } from '@/lib/photo-wall/marketing'
import type {
  MyPost,
  MyPostDeletionStatus,
  MyPostMarketingStatus,
} from '@/lib/photo-wall/my-posts'
import { readDeviceCookie, wallConference } from '@/lib/photo-wall/request'
import { isWallPostId } from '@/lib/photo-wall/wall-post'

/**
 * THE SERVER ACTIONS OF `/wall/post` (Photo Wall spec §6.1, §8, §12). They
 * post to the page's own path, under the device cookie's `Path=/wall`, which
 * `/api/trpc` never receives; each reads the device from the cookie on the
 * server and acts as that device and no other. CSRF: Next's Server Action
 * origin check and the `SameSite=Lax`, host-only cookie.
 */

/**
 * `ensureDevice()` (§6.1): the composer calls it when it loads and enables
 * Post to the wall once it has answered, so the device cookie is set BEFORE
 * the first submit. Were it set on the submit's own answer, a lost answer
 * would take the cookie with it, and the retry would arrive as another
 * device and be refused.
 *
 * Keeps a valid cookie as it is; issues one otherwise, expiring at the end
 * of the wall's deletion date. Answers whether the device has a cookie now.
 */
export async function ensureDevice(): Promise<boolean> {
  const host = await wallConference()
  if (!host.ok) return false
  const { conference } = host
  if (!(await getPhotoWall(conference._id))) return false

  if (await readDeviceCookie()) return true
  const expires = deletionDateEnd(conference.endDate)
  // No end date: posting never opens (§7), so no device is needed.
  if (!expires) return false
  const { name, options } = wallDeviceCookie(expires)
  ;(await cookies()).set(name, issueWallDevice().value, options)
  return true
}

/** The Host's conference and the cookie's device, or null without either. */
async function thisDevice() {
  const host = await wallConference()
  if (!host.ok) return null
  const device = await readDeviceCookie()
  if (!device) return null
  return { conferenceId: host.conference._id, deviceKey: device.key }
}

/**
 * My posts (§8, §12): this device's posts on the Host's wall, from the
 * cached read under the device's tag. Empty without a valid cookie: a phone
 * that lost it has no posts to show (§6.1).
 */
export async function getMyPosts(): Promise<MyPost[]> {
  const device = await thisDevice()
  if (!device) return []
  return readCachedMyPosts(device.conferenceId, device.deviceKey)
}

export type MyPostDeletion = { status: MyPostDeletionStatus }

/**
 * Delete one of this device's posts (§12), with `deleteWallPost`, which
 * reads the post through the doc endpoint and refuses, BEFORE any write,
 * one that is not this device's: a foreign post and a missing one are both
 * `gone`. Without a cookie nothing is read: there is no device to own a
 * post. `failed` leaves the post `deleting`; pressing again finishes it.
 *
 * Expires the wall, the queue and the device ONLY when something was
 * written (§8): `deleted`, `failed` once the `deleting` mark landed, or a
 * throw (the mark may have committed with its answer lost). Never on
 * `gone`: a phone looping Delete on ids it does not own must not make every
 * screen's and the admin's poll refill from Sanity. The wall on any write,
 * not only an approved post's: this read does not say which it was, and a
 * `deleting` post has left the wall either way.
 */
export async function deleteMyPost(postId: string): Promise<MyPostDeletion> {
  const device = await thisDevice()
  if (!device || !isWallPostId(postId)) return { status: 'gone' }
  const { conferenceId, deviceKey } = device
  let written = true
  try {
    const result = await deleteWallPost({ conferenceId, postId, deviceKey })
    written =
      result.status === 'deleted' ||
      (result.status === 'failed' && result.marked)
    return { status: result.status }
  } finally {
    if (written) updateWallPostTags(conferenceId, deviceKey, { wall: true })
  }
}

export type MyPostMarketing = { status: MyPostMarketingStatus }

/**
 * The Marketing switch (§12) on one of this device's posts: a
 * revision-guarded patch of `marketingConsent`, by `setWallPostMarketing`,
 * which refuses a post that is not this device's before any write. Expires
 * the queue (its Marketing OK mark) and the device once written, never the
 * wall: consent changes nothing the wall shows. Nothing on `gone` or
 * `changed`: nothing was written.
 */
export async function setMyPostMarketing(
  postId: string,
  consent: boolean,
): Promise<MyPostMarketing> {
  const device = await thisDevice()
  if (!device || !isWallPostId(postId) || typeof consent !== 'boolean') {
    return { status: 'gone' }
  }
  const { conferenceId, deviceKey } = device
  const result = await setWallPostMarketing({
    conferenceId,
    postId,
    deviceKey,
    consent,
  })
  if (result.status === 'done') {
    updateWallPostTags(conferenceId, deviceKey, { wall: false })
  }
  return result
}
