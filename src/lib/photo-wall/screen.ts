/**
 * SCREEN MODE as `/wall/screen` reads the wall (Photo Wall spec §8, §9.2):
 * the shapes `photoWallPublic.screen` answers every 5 s. Pure, safe to
 * import on the client.
 */
import type { WallLook } from './types'
import type { WholePhoto } from './wall'

/** The path of Screen Mode, which no analytics may count (§9.2). */
export const SCREEN_MODE_PATH = '/wall/screen'
/** The screen's whole photo, on its long edge: Spotlight's big post (§9). */
export const SCREEN_WHOLE_PX = 1400
/** {@link SCREEN_MODE_PATH} and anything under it, in any case. */
export const SCREEN_PATH = new RegExp(`^${SCREEN_MODE_PATH}(/|$)`, 'i')

/** Is this Screen Mode, `/wall/screen` or anything under it? */
export function isScreenModePath(pathname: string | null | undefined): boolean {
  return typeof pathname === 'string' && SCREEN_PATH.test(pathname)
}

/** Is this URL (absolute or a bare path) Screen Mode's? */
export function isScreenModeUrl(url: string): boolean {
  try {
    return isScreenModePath(new URL(url).pathname)
  } catch {
    return isScreenModePath(url)
  }
}

/** One approved Wall Post as the screen shows it (§9.2). */
export interface ScreenPost {
  _id: string
  /** The square, already cut by Sanity's `rect=` from the crop (§5.1): Pinboard. */
  src: string
  /** The whole photo: Mosaic and Spotlight. */
  whole: WholePhoto
  caption: string | null
  name: string | null
  /** With `_id`, what makes a post new to a screen: re-approved is new again. */
  approvedAt: string
}

/** What `photoWallPublic.screen` answers and Screen Mode polls. */
export interface ScreenView {
  /** Closed by the retention cron: the screen says so and shows nothing (§11.1). */
  closed: boolean
  /** The Sponsor strip switch (§9.4), read on every poll. */
  sponsorStrip: boolean
  /** The wall's look, read on every poll; a screen's `?look=` overrides it. */
  look: WallLook
  /** Newest approval first, at most 200 (§8). */
  posts: ScreenPost[]
}

/** The key a screen remembers a post by: the same post re-approved is new again (§9.2). */
export function screenPostKey(post: Pick<ScreenPost, '_id' | 'approvedAt'>) {
  return `${post._id}@${post.approvedAt}`
}
