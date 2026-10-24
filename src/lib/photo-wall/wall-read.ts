import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { WALL_POST_LIMIT, type WallPost } from './wall'

/**
 * The wall's posts (Photo Wall spec §8) on the NON-CDN client, so the cached
 * {@link getWall} in `./cache` refills with what an approval just wrote,
 * never a CDN answer that lags it.
 */

interface WallPostRow {
  _id: string
  photo: {
    url: string | null
    width: number | null
    height: number | null
  } | null
  crop: { x: number | null; y: number | null } | null
  caption: string | null
  name: string | null
  approvedAt: string | null
}

/** The newest {@link WALL_POST_LIMIT} approvals of the conference, newest first. */
export async function readWallPosts(conferenceId: string): Promise<WallPost[]> {
  const rows = await scopedFetch<WallPostRow[]>(
    clientReadUncached,
    { conferenceId },
    // The projection names what the public gets: never `deviceKey`,
    // `marketingConsent` or the submission time. A post without a photo
    // can't be shown, so it doesn't take one of the 200. Published only.
    `*[_type == "wallPost" && status == "approved" && defined(photo.asset) && !(_id in path("drafts.**"))]
      | order(approvedAt desc, _id asc) [0...${WALL_POST_LIMIT}] {
      _id,
      "photo": photo.asset->{
        url,
        "width": metadata.dimensions.width,
        "height": metadata.dimensions.height
      },
      crop{ x, y },
      caption,
      name,
      approvedAt
    }`,
  )
  const posts: WallPost[] = []
  for (const row of rows) {
    const { photo } = row
    if (!photo?.url || !photo.width || !photo.height || !row.approvedAt) {
      console.warn(`Wall Post ${row._id} is approved but can't be shown`)
      continue
    }
    posts.push({
      _id: row._id,
      photo: { url: photo.url, width: photo.width, height: photo.height },
      // A missing crop is centred, as on the admin card.
      crop: { x: row.crop?.x ?? 0.5, y: row.crop?.y ?? 0.5 },
      caption: row.caption ?? null,
      name: row.name ?? null,
      approvedAt: row.approvedAt,
    })
  }
  return posts
}
