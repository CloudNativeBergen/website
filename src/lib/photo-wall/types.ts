import type { PostingState } from './window'

/**
 * The Photo Wall's settings (Photo Wall spec §4.1, §7). Automatic opens and
 * closes posting with the conference days; Open and Paused override it.
 */
export const POSTING_MODES = ['auto', 'open', 'paused'] as const
export type PostingMode = (typeof POSTING_MODES)[number]

/**
 * The mode a stored value means (§7): a missing one is Automatic, the
 * default; anything the switch does not offer is Paused, so a stray value
 * never opens posting.
 */
export function postingModeOf(stored: unknown): PostingMode {
  if (stored == null) return 'auto'
  return (POSTING_MODES as readonly unknown[]).includes(stored)
    ? (stored as PostingMode)
    : 'paused'
}

/**
 * The Wall Looks (Photo Wall spec §4.1, §9): how the Wall page and Screen
 * Mode lay out the approved posts. An organizer picks one per wall; a
 * screen's own link can override it with `?look=`.
 */
export const WALL_LOOKS = ['pinboard', 'mosaic', 'spotlight'] as const
export type WallLook = (typeof WALL_LOOKS)[number]

export function isWallLook(value: unknown): value is WallLook {
  return (WALL_LOOKS as readonly unknown[]).includes(value)
}

/** The look a stored value means: anything missing or unknown is Pinboard (§4.1). */
export function wallLookOf(stored: unknown): WallLook {
  return isWallLook(stored) ? stored : 'pinboard'
}

/** A conference's `photoWall` document as the server reads it. */
export interface PhotoWall {
  _id: string
  /** A missing mode reads as Automatic; an unrecognised one as Paused (§7). */
  postingMode: PostingMode
  sponsorStrip: boolean
  /** Missing or unknown reads as Pinboard (§4.1). */
  look: WallLook
  /** Trusted posters skip approval (§6.6); missing reads as off. */
  trustedPostersSkipApproval: boolean
  /** Set by the retention cron (P1): closed to writes. */
  closedAt: string | null
}

/** What the admin page shows of the wall (§10). */
export interface PhotoWallAdminView {
  /** Null until an organizer presses Set up the Photo Wall. */
  wall: PhotoWall | null
  /** Whether a Submit now would find posting open, and if not why (§7). */
  posting: PostingState
  /** The conference's first day, when posting is `notYetOpen`: when it opens (§7). */
  opensOn?: string
  links: PhotoWallLinks
  /**
   * How many photos the consented ZIP export would hold now (P5); unknown
   * when absent.
   */
  marketingExportCount?: number
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
  look?: WallLook
  trustedPostersSkipApproval?: boolean
}
