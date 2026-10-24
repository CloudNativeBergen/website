import 'server-only'
import { getWall } from './cache'
import { squareSrc } from './square'
import {
  WALL_PAGE_PHOTO_PX,
  type WallPagePost,
  type WallPageView,
  type WallPost,
} from './wall'
import { isPostingOpen } from './window'

/**
 * A post as a polaroid shows it, on the Wall page and on Screen Mode: the
 * same square URL for both, so Sanity cuts each photo once.
 */
export function polaroidPost(post: WallPost): WallPagePost {
  return {
    _id: post._id,
    src: squareSrc(post.photo, post.crop, WALL_PAGE_PHOTO_PX),
    caption: post.caption,
    name: post.name,
  }
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
    posts: closed ? [] : posts.map(polaroidPost),
  }
}
