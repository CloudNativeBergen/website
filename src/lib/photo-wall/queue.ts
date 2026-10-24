import 'server-only'
import { clientReadUncached, sanityImage } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import {
  WALL_POST_STATUSES,
  type ModerationPost,
  type ModerationQueue,
  type WallPostStatus,
} from './moderation'

/**
 * The moderation queue's read (Photo Wall spec §8, §10): every Wall Post of
 * the conference on the NON-CDN client, so the cached function that wraps it
 * ({@link getModerationQueue} in `./cache`) refills with what a moderation
 * action just wrote, never a CDN answer that lags it.
 */

/** The admin card shows the whole photo at about this width, `fit=max` (§5.1). */
export const ADMIN_PHOTO_WIDTH = 1200

interface PostRow {
  _id: string
  status: string | null
  photo: {
    url: string | null
    width: number | null
    height: number | null
  } | null
  crop: { x: number | null; y: number | null } | null
  caption: string | null
  name: string | null
  marketingConsent: boolean | null
  submittedAt: string | null
  approvedAt: string | null
  decidedAt: string | null
}

const isStatus = (value: unknown): value is WallPostStatus =>
  WALL_POST_STATUSES.includes(value as WallPostStatus)

/** The photo as the card shows it, or null when the post has none (§12). */
function photoOf(row: PostRow): ModerationPost['photo'] {
  const { photo } = row
  if (!photo?.url || !photo.width || !photo.height) return null
  return {
    url: sanityImage(photo.url)
      .width(ADMIN_PHOTO_WIDTH)
      .fit('max')
      .auto('format')
      .url(),
    width: photo.width,
    height: photo.height,
  }
}

/** Every Wall Post of the conference, newest submission first. */
export async function readModerationQueue(
  conferenceId: string,
): Promise<ModerationQueue> {
  const rows = await scopedFetch<PostRow[]>(
    clientReadUncached,
    { conferenceId },
    // The projection names what the browser gets: never `deviceKey`, nor the
    // asset id a Delete still has to remove.
    `*[_type == "wallPost"] | order(submittedAt desc) {
      _id,
      status,
      "photo": photo.asset->{
        url,
        "width": metadata.dimensions.width,
        "height": metadata.dimensions.height
      },
      crop{ x, y },
      caption,
      name,
      marketingConsent,
      submittedAt,
      approvedAt,
      decidedAt
    }`,
  )
  const posts: ModerationPost[] = []
  for (const row of rows) {
    if (!isStatus(row.status)) {
      console.warn(`Wall Post ${row._id} has an unknown status`, row.status)
      continue
    }
    posts.push({
      _id: row._id,
      status: row.status,
      photo: photoOf(row),
      crop: { x: row.crop?.x ?? 0.5, y: row.crop?.y ?? 0.5 },
      caption: row.caption ?? null,
      name: row.name ?? null,
      marketingConsent: row.marketingConsent === true,
      submittedAt: row.submittedAt ?? null,
      approvedAt: row.approvedAt ?? null,
      decidedAt: row.decidedAt ?? null,
    })
  }
  return {
    posts,
    pendingCount: posts.filter((p) => p.status === 'pending').length,
  }
}
