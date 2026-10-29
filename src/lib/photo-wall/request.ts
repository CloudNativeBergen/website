/**
 * What the `/wall` endpoints that need the device read from a request (Photo
 * Wall spec §6.1): the Host's conference and the device cookie. Shared by the
 * submit route and `ensureDevice()`, so both resolve them the same way.
 */
import 'server-only'
import { cookies } from 'next/headers'
import { isConferenceUnavailable, isUnknownHost } from '@/lib/conference/guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { WALL_DEVICE_COOKIE, readWallDevice, type WallDevice } from './device'

type Conference = Awaited<
  ReturnType<typeof getConferenceForCurrentDomain>
>['conference']

/**
 * The Host's conference, or why there is none: `unavailable` (the read
 * failed, never "no conference") or `unknown` (no conference on this host).
 */
export async function wallConference(): Promise<
  | { ok: true; conference: Conference }
  | { ok: false; reason: 'unavailable' | 'unknown' }
> {
  const resolution = await getConferenceForCurrentDomain()
  if (isConferenceUnavailable(resolution)) {
    return { ok: false, reason: 'unavailable' }
  }
  if (isUnknownHost(resolution)) return { ok: false, reason: 'unknown' }
  return { ok: true, conference: resolution.conference }
}

/** The device of the request's `konf_wall` cookie, or null without a valid one. */
export async function readDeviceCookie(): Promise<WallDevice | null> {
  return readWallDevice((await cookies()).get(WALL_DEVICE_COOKIE)?.value)
}
