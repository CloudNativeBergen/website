/**
 * The Photo Wall's settings (Photo Wall spec §4.1). Monday offers Open and
 * Paused; Automatic is slice P2.
 */
export const POSTING_MODES = ['open', 'paused'] as const
export type PostingMode = (typeof POSTING_MODES)[number]

/** A conference's `photoWall` document as the server reads it. */
export interface PhotoWall {
  _id: string
  /** A missing mode reads as Paused (§4.1). */
  postingMode: PostingMode
  sponsorStrip: boolean
  /** Set by the retention cron (P1): closed to writes. */
  closedAt: string | null
}

/** What the admin page shows of the wall (§10). */
export interface PhotoWallAdminView {
  /** Null until an organizer presses Set up the Photo Wall. */
  wall: PhotoWall | null
  /** Whether a Submit now would find posting open (§7). */
  postingOpen: boolean
  links: PhotoWallLinks
}

export interface PhotoWallLinks {
  /** The Composer, where the QR points. */
  post: string
  wall: string
  screen: string
}
