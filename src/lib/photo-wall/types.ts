import type { PostingState } from './window'

/**
 * The Photo Wall's settings (Photo Wall spec §4.1, §7). Automatic opens and
 * closes posting with the conference days; Open and Paused override it.
 */
export const POSTING_MODES = ['auto', 'open', 'paused'] as const
export type PostingMode = (typeof POSTING_MODES)[number]

/** A conference's `photoWall` document as the server reads it. */
export interface PhotoWall {
  _id: string
  /** A missing mode reads as Automatic; an unrecognised one as Paused (§7). */
  postingMode: PostingMode
  sponsorStrip: boolean
  /** Set by the retention cron (P1): closed to writes. */
  closedAt: string | null
}

/** What the admin page shows of the wall (§10). */
export interface PhotoWallAdminView {
  /** Null until an organizer presses Set up the Photo Wall. */
  wall: PhotoWall | null
  /** Whether a Submit now would find posting open, and if not why (§7). */
  posting: PostingState
  links: PhotoWallLinks
}

export interface PhotoWallLinks {
  /** The Composer, where the QR points. */
  post: string
  wall: string
  screen: string
}

/** A change an organizer makes on the admin page (§10). */
export interface PhotoWallSettingsChange {
  postingMode?: PostingMode
  sponsorStrip?: boolean
}
