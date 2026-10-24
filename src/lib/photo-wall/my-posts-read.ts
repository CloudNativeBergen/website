import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { WALL_POST_STATUSES, type WallPostStatus } from './moderation'
import { MY_POSTS_PHOTO_PX, type MyPost } from './my-posts'
import { squareSrc } from './square'

/**
 * My posts' read (Photo Wall spec §8, §12): one device's Wall Posts on this
 * conference's wall, on the NON-CDN client, so the cached {@link getMyPosts}
 * in `./cache` refills with what a Delete or a moderation action just wrote,
 * never a CDN answer that lags it.
 */

interface MyPostRow {
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
}

const isStatus = (value: unknown): value is WallPostStatus =>
  WALL_POST_STATUSES.includes(value as WallPostStatus)

/** The square as the card shows it, or null: a `deleting` post has none (§12). */
function srcOf(row: MyPostRow): string | null {
  const { photo } = row
  if (row.status === 'deleting') return null
  if (!photo?.url || !photo.width || !photo.height) return null
  return squareSrc(
    { url: photo.url, width: photo.width, height: photo.height },
    { x: row.crop?.x ?? 0.5, y: row.crop?.y ?? 0.5 },
    MY_POSTS_PHOTO_PX,
  )
}

/** This device's posts on the conference's wall, newest submission first. */
export async function readMyPosts(
  conferenceId: string,
  deviceKey: string,
): Promise<MyPost[]> {
  const rows = await scopedFetch<MyPostRow[]>(
    clientReadUncached,
    { conferenceId },
    // The projection names what the phone gets: never an asset id (a
    // Delete acts on the id and the device, not on the asset). Published
    // posts only: a draft is never a Wall Post. The device key is a
    // parameter, never spliced into the text.
    `*[_type == "wallPost" && deviceKey == $deviceKey && !(_id in path("drafts.**"))] | order(submittedAt desc) {
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
      submittedAt
    }`,
    { deviceKey },
  )
  const posts: MyPost[] = []
  for (const row of rows) {
    if (!isStatus(row.status)) {
      console.warn(`Wall Post ${row._id} has an unknown status`, row.status)
      continue
    }
    posts.push({
      _id: row._id,
      status: row.status,
      src: srcOf(row),
      caption: row.caption ?? null,
      name: row.name ?? null,
      marketingConsent: row.marketingConsent === true,
      submittedAt: row.submittedAt ?? null,
    })
  }
  return posts
}
