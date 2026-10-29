import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import {
  postingModeOf,
  wallLookOf,
  type PhotoWall,
  type PhotoWallSettingsChange,
} from './types'

/**
 * The Photo Wall's document in Sanity (Photo Wall spec §4.1). Every read is
 * on the NON-CDN client: the admin page shows what a change just wrote, and
 * the cached public read must not refill from a CDN answer that lags it.
 */

/** Deterministic, so a second Set up converges on one document. */
export function photoWallId(conferenceId: string): string {
  return `photoWall-${conferenceId}`
}

interface PhotoWallRow {
  _id: string
  postingMode?: string | null
  sponsorStrip?: boolean | null
  look?: string | null
  trustedPostersSkipApproval?: boolean | null
  closedAt?: string | null
}

/** The conference's wall, or null when it has none. */
export async function readPhotoWall(
  conferenceId: string,
): Promise<PhotoWall | null> {
  const row = await scopedFetch<PhotoWallRow | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "photoWall" && _id == $id][0]{ _id, postingMode, sponsorStrip, look, trustedPostersSkipApproval, closedAt }`,
    { id: photoWallId(conferenceId) },
  )
  if (!row) return null
  return {
    _id: row._id,
    postingMode: postingModeOf(row.postingMode),
    sponsorStrip: row.sponsorStrip === true,
    look: wallLookOf(row.look),
    trustedPostersSkipApproval: row.trustedPostersSkipApproval === true,
    closedAt: row.closedAt ?? null,
  }
}

/**
 * Set up the Photo Wall: create it Automatic with the sponsor strip off, or
 * keep the one already there as it is.
 */
export async function setUpPhotoWall(conferenceId: string): Promise<PhotoWall> {
  await clientWrite
    .transaction()
    .createIfNotExists({
      _id: photoWallId(conferenceId),
      _type: 'photoWall',
      conference: { _type: 'reference', _ref: conferenceId },
      postingMode: 'auto',
      sponsorStrip: false,
      // New walls only: an existing wall reads a missing value as off (§6.6).
      trustedPostersSkipApproval: true,
    })
    .commit()
  const wall = await readPhotoWall(conferenceId)
  if (!wall) throw new Error('The Photo Wall was not found after Set up')
  return wall
}

/**
 * Change the wall's settings, answering with the wall as stored. Null,
 * writing nothing, when the conference has no wall.
 */
export async function updatePhotoWallSettings(
  conferenceId: string,
  changes: PhotoWallSettingsChange,
): Promise<PhotoWall | null> {
  const wall = await readPhotoWall(conferenceId)
  if (!wall) return null
  await clientWrite.patch(wall._id).set(changes).commit()
  // Read again: another organizer's change may have landed meanwhile.
  return readPhotoWall(conferenceId)
}
