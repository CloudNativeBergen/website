'use server'

import { cookies } from 'next/headers'
import { getPhotoWall } from '@/lib/photo-wall/cache'
import { deletionDateEnd } from '@/lib/photo-wall/deletion'
import { issueWallDevice, wallDeviceCookie } from '@/lib/photo-wall/device'
import { readDeviceCookie, wallConference } from '@/lib/photo-wall/request'

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
