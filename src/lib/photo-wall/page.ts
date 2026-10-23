import 'server-only'
import { notFound } from 'next/navigation'
import { isConferenceUnavailable, isUnknownHost } from '@/lib/conference/guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getPhotoWall } from './cache'

/**
 * The gate of every `/wall` route (Photo Wall spec §4.1): the Host's
 * conference and its wall, or 404 when the conference has no wall, so the
 * routes don't appear on every tenant's domain. A failed conference read is
 * not "no wall": it throws to Next's error page, never a 404 that would
 * claim the conference has no wall.
 */
export async function requirePhotoWall() {
  const resolution = await getConferenceForCurrentDomain()
  if (isConferenceUnavailable(resolution)) {
    throw new Error('Could not read the conference for this Photo Wall')
  }
  if (isUnknownHost(resolution)) notFound()
  const { conference } = resolution
  const wall = await getPhotoWall(conference._id)
  if (!wall) notFound()
  return { conference, wall }
}
