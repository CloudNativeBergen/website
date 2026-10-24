import 'server-only'
import { sanityImage } from '@/lib/sanity/client'
import { getWall } from './cache'
import { cropSquare } from './crop'
import { WALL_PAGE_PHOTO_PX, type WallPageView, type WallPost } from './wall'
import { isPostingOpen } from './window'

/** The square a polaroid shows, cut by Sanity with `rect=` (§5.1). */
function squareSrc(post: WallPost, px: number): string {
  const { x, y, size } = cropSquare(
    post.photo.width,
    post.photo.height,
    post.crop,
  )
  return sanityImage(post.photo.url)
    .rect(x, y, size, size)
    .width(px)
    .height(px)
    .auto('format')
    .url()
}

/** The conference fields the Wall page's view depends on. */
interface ConferenceDays {
  _id: string
  startDate?: string | null
  endDate?: string | null
}

/**
 * The Wall page's view of the conference's cached wall at `now`, or null
 * when it has no wall: what `/wall` renders first and `photoWallPublic.get`
 * answers every poll. A closed wall shows nothing but that it closed (§9.1).
 */
export async function readWallPage(
  conference: ConferenceDays,
  now: Date,
): Promise<WallPageView | null> {
  const data = await getWall(conference._id)
  if (!data) return null
  const { wall, posts } = data
  const closed = wall.closedAt !== null
  return {
    closed,
    postingOpen: isPostingOpen(wall, conference, now),
    posts: closed
      ? []
      : posts.map((post) => ({
          _id: post._id,
          src: squareSrc(post, WALL_PAGE_PHOTO_PX),
          caption: post.caption,
          name: post.name,
        })),
  }
}
