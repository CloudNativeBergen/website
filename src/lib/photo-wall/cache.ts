import 'server-only'
import { cacheLife, cacheTag, revalidateTag } from 'next/cache'
import { photoWallAdminTag, photoWallTag } from '@/lib/cache/tags'
import type { ModerationQueue } from './moderation'
import { readModerationQueue } from './queue'
import { readPhotoWall } from './sanity'
import type { PhotoWall } from './types'

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
 * The moderation queue as `/admin/photo-wall` polls it (§8), cached per
 * conference under {@link photoWallAdminTag}. Default life: freshness comes
 * from the tag, which Submit, every moderation action, a contributor's Delete
 * or marketing change, and the retention cron expire (M3b, M4b, M6, P1).
 */
export async function getModerationQueue(
  conferenceId: string,
): Promise<ModerationQueue> {
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
