import 'server-only'
import { cacheLife, cacheTag, revalidateTag, updateTag } from 'next/cache'
import {
  photoWallAdminTag,
  photoWallDeviceTag,
  photoWallTag,
} from '@/lib/cache/tags'
import type { ModerationQueueData } from './moderation'
import type { MyPost } from './my-posts'
import { readMyPosts } from './my-posts-read'
import { readModerationQueue } from './queue'
import { readPhotoWall } from './sanity'
import type { PhotoWall } from './types'
import type { WallData } from './wall'
import { readWallPosts } from './wall-read'

/**
 * The conference's wall as the public `/wall` routes read it (Photo Wall spec
 * §8), cached per conference under {@link photoWallTag}. `'use cache:
 * remote'` over the uncached client: freshness comes from the tag, which
 * Set up and every settings change expire.
 */
export async function getPhotoWall(
  conferenceId: string,
): Promise<PhotoWall | null> {
  'use cache: remote'
  cacheLife('default')
  cacheTag(photoWallTag(conferenceId))
  return readPhotoWall(conferenceId)
}

/**
 * The public wall (§8): the settings and the newest 200 approved posts,
 * newest approval first, or null when the conference has no wall. Cached
 * per conference under {@link photoWallTag}, which Approve, a Reject, Remove
 * or Delete of an approved post, every settings change and the retention
 * cron expire. `'use cache: remote'` over the uncached client, `default`
 * life: freshness comes from the tag. The Wall page and Screen Mode poll it.
 */
export async function getWall(conferenceId: string): Promise<WallData | null> {
  'use cache: remote'
  cacheLife('default')
  cacheTag(photoWallTag(conferenceId))
  const wall = await readPhotoWall(conferenceId)
  if (!wall) return null
  return { wall, posts: await readWallPosts(conferenceId) }
}

/**
 * The moderation queue as `/admin/photo-wall` polls it (§8), cached per
 * conference under {@link photoWallAdminTag}. Default life: freshness comes
 * from the tag, which every write to a post expires ({@link expireWallPost}).
 */
export async function getModerationQueue(
  conferenceId: string,
): Promise<ModerationQueueData> {
  'use cache: remote'
  cacheLife('default')
  cacheTag(photoWallAdminTag(conferenceId))
  return readModerationQueue(conferenceId)
}

/**
 * Expire the wall's public reads after a write committed. `revalidateTag`
 * with `{ expire: 0 }`: the admin's tRPC mutations run in a Route Handler,
 * where `updateTag` throws. Never fails the write it rides on.
 */
export function expirePhotoWall(conferenceId: string): void {
  const tag = photoWallTag(conferenceId)
  try {
    revalidateTag(tag, { expire: 0 })
  } catch (error) {
    console.error(`Could not expire the Photo Wall cache tag ${tag}`, error)
  }
}

/**
 * The tags a Wall Post write changes (§8): the moderation queue, the
 * contributor's My posts and, with `wall`, the public wall.
 */
function wallPostTags(
  conferenceId: string,
  deviceKey: string,
  { wall }: { wall: boolean },
): string[] {
  const tags = [photoWallAdminTag(conferenceId), photoWallDeviceTag(deviceKey)]
  if (wall) tags.push(photoWallTag(conferenceId))
  return tags
}

/** Expire each tag with `expire`, never failing the write it rides on. */
function expireEach(tags: string[], expire: (tag: string) => void): void {
  for (const tag of tags) {
    try {
      expire(tag)
    } catch (error) {
      console.error(`Could not expire the Photo Wall cache tag ${tag}`, error)
    }
  }
}

/**
 * Expire what a Wall Post write changes (§8) from a Route Handler or a tRPC
 * mutation: `revalidateTag` with `{ expire: 0 }`, as {@link expirePhotoWall}.
 */
export function expireWallPost(
  conferenceId: string,
  deviceKey: string,
  options: { wall: boolean },
): void {
  expireEach(wallPostTags(conferenceId, deviceKey, options), (tag) =>
    revalidateTag(tag, { expire: 0 }),
  )
}

/**
 * One device's posts as My posts polls them (§8), cached per conference and
 * device under {@link photoWallDeviceTag}, which Submit, the device's own
 * Delete and marketing change, and every moderation of one of its posts
 * expire. `'use cache: remote'` over the uncached client, `default` life:
 * freshness comes from the tag. The device key comes from the cookie, read
 * OUTSIDE this scope by the Server Action that calls it.
 */
export async function getMyPosts(
  conferenceId: string,
  deviceKey: string,
): Promise<MyPost[]> {
  'use cache: remote'
  cacheLife('default')
  cacheTag(photoWallDeviceTag(deviceKey))
  return readMyPosts(conferenceId, deviceKey)
}

/**
 * {@link expireWallPost} for a Server Action (§8): `updateTag`, so the
 * action's own next read of My posts waits for the fresh list instead of
 * serving the one the write just outdated. Same never-fail rule: a missed
 * expiry is recovered by the next poll after the tag's own life.
 */
export function updateWallPostTags(
  conferenceId: string,
  deviceKey: string,
  options: { wall: boolean },
): void {
  expireEach(wallPostTags(conferenceId, deviceKey, options), updateTag)
}
