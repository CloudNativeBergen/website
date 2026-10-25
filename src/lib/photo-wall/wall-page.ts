import 'server-only'
import { getWall } from './cache'
import { squareSrc, wholeSrc } from './square'
import {
  WALL_PAGE_PHOTO_PX,
  WALL_PAGE_WHOLE_PX,
  type WallPagePost,
  type WallPageView,
  type WallPost,
} from './wall'
import { isPostingOpen } from './window'

/**
 * A post as the public pages show it, `wholePx` the long edge of its whole
 * photo: the same square URL on the Wall page and Screen Mode, so Sanity
 * cuts each square once.
 */
export function publicPost(post: WallPost, wholePx: number): WallPagePost {
  const { width, height } = post.photo
  return {
    _id: post._id,
    src: squareSrc(post.photo, post.crop, WALL_PAGE_PHOTO_PX),
    whole: { src: wholeSrc(post.photo, wholePx), width, height },
    caption: post.caption,
    name: post.name,
    approvedAt: post.approvedAt,
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
    look: wall.look,
    posts: closed ? [] : posts.map((p) => publicPost(p, WALL_PAGE_WHOLE_PX)),
  }
}
