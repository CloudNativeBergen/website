import 'server-only'
import { cacheLife, cacheTag, revalidateTag } from 'next/cache'
import { photoWallAdminTag, photoWallTag } from '@/lib/cache/tags'
import type { ModerationQueueData } from './moderation'
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
 * conference under {@link photoWallAdminTag}. Default life: freshness is to
 * come from the tag, but NO write expires it yet. Submit (M3b), the
 * moderation actions (M4b), a contributor's Delete or marketing change (M6)
 * and the retention cron (P1) add that; until then the queue refreshes on
 * the `default` life alone.
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
