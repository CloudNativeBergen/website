/**
 * THE WALL as the public pages read it (Photo Wall spec §8, §9). Pure: the
 * shapes `getWall` caches and the Wall page polls. Safe to import on the
 * client.
 */
import type { WallPostCrop } from './moderation'
import type { PhotoWall, WallLook } from './types'

/** The wall shows at most this many of the newest approvals (§8, §9.1). */
export const WALL_POST_LIMIT = 200

/** The Wall page's square, in px: about 600 wide on a phone (§5.1). */
export const WALL_PAGE_PHOTO_PX = 600
/** The Wall page's whole photo, on its long edge: a phone-wide feed (§9). */
export const WALL_PAGE_WHOLE_PX = 1000

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

/** The whole photo as a look shows it: its URL, scaled, and its shape. */
export interface WholePhoto {
  src: string
  width: number
  height: number
}

/** One post on the Wall page (§9.1). */
export interface WallPagePost {
  _id: string
  /** The square, already cut by Sanity's `rect=` from the crop (§5.1): Pinboard. */
  src: string
  /** The whole photo: Mosaic and Spotlight. */
  whole: WholePhoto
  caption: string | null
  name: string | null
  approvedAt: string
}

/** The most photos a program talk card shows (talk photos spec §3, §7.1). */
export const TALK_CARD_PHOTO_LIMIT = 6

/** What `photoWallPublic.talkPhotos` answers: the first photos and how many there are. */
export interface TalkPhotosView {
  posts: WallPagePost[]
  count: number
}

/** What the public `photoWallPublic.get` query answers and the Wall page polls. */
export interface WallPageView {
  /** Closed by the retention cron: the page says so and shows nothing (§11.1). */
  closed: boolean
  /** Whether **Add your photo** shows (§7, §9.1). */
  postingOpen: boolean
  /** The wall's look; visitors can't switch it (§9). */
  look: WallLook
  posts: WallPagePost[]
}
