/**
 * THE WALL as the public pages read it (Photo Wall spec §8, §9). Pure: the
 * shapes `getWall` caches and the Wall page polls. Safe to import on the
 * client.
 */
import type { WallPostCrop } from './moderation'
import type { PhotoWall } from './types'

/** The wall shows at most this many of the newest approvals (§8, §9.1). */
export const WALL_POST_LIMIT = 200

/** The Wall page's square, in px: about 600 wide on a phone (§5.1). */
export const WALL_PAGE_PHOTO_PX = 600

/** One approved Wall Post as `getWall` caches it: the WHOLE photo (§8). */
export interface WallPost {
  _id: string
  /** The asset's own URL and size; each page cuts its square from it. */
  photo: { url: string; width: number; height: number }
  crop: WallPostCrop
  caption: string | null
  name: string | null
  approvedAt: string
}

/** What `getWall` caches per conference: the settings and the posts. */
export interface WallData {
  wall: PhotoWall
  /** Newest approval first, at most {@link WALL_POST_LIMIT}. */
  posts: WallPost[]
}

/** One polaroid on the Wall page (§9.1). */
export interface WallPagePost {
  _id: string
  /** The square, from Sanity's `rect=` (§5.1). */
  src: string
  /** Where the square sits on the whole photo; `src` is already cut to it. */
  crop: WallPostCrop
  caption: string | null
  name: string | null
  approvedAt: string
}

/** What the public `wall.get` query answers and the Wall page polls. */
export interface WallPageView {
  /** Closed by the retention cron: the page says so and shows nothing (§11.1). */
  closed: boolean
  /** Whether **Add your photo** shows (§7, §9.1). */
  postingOpen: boolean
  /** Screen Mode's sponsor strip switch, arriving with every poll (§9.4). */
  sponsorStrip: boolean
  posts: WallPagePost[]
}
