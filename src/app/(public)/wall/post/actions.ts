'use server'

import { cookies } from 'next/headers'
import { isConferenceUnavailable, isUnknownHost } from '@/lib/conference/guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getPhotoWall } from '@/lib/photo-wall/cache'
import { deletionDateEnd } from '@/lib/photo-wall/deletion'
import {
  WALL_DEVICE_COOKIE,
  issueWallDevice,
  readWallDevice,
  wallDeviceCookie,
} from '@/lib/photo-wall/device'

/**
 * `ensureDevice()` (Photo Wall spec §6.1): the composer calls it when it
 * loads and enables Post to the wall once it has answered, so the device
 * cookie is set BEFORE the first submit. Were it set on the submit's own
 * answer, a lost answer would take the cookie with it, and the retry would
 * arrive as another device and be refused.
 *
 * A Server Action of `/wall/post`: it posts to the page's own path, under the
 * cookie's `Path=/wall`. Keeps a valid cookie as it is; issues one otherwise,
 * expiring at the end of the wall's deletion date. Answers whether the
 * device has a cookie now. CSRF: Next's Server Action origin check and the
 * `SameSite=Lax`, host-only cookie.
 */
export async function ensureDevice(): Promise<boolean> {
  const resolution = await getConferenceForCurrentDomain()
  if (isConferenceUnavailable(resolution) || isUnknownHost(resolution)) {
    return false
  }
  const { conference } = resolution
  if (!(await getPhotoWall(conference._id))) return false

  const store = await cookies()
  if (readWallDevice(store.get(WALL_DEVICE_COOKIE)?.value)) return true
  const expires = deletionDateEnd(conference.endDate)
  // No end date: posting never opens (§7), so no device is needed.
  if (!expires) return false
  const { name, options } = wallDeviceCookie(expires)
  store.set(name, issueWallDevice().value, options)
  return true
}
