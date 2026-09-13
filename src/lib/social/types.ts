/**
 * Social posting core — domain types (dashboard #786, amended by #788).
 *
 * A `socialPost` is the canonical post an organizer writes once; a
 * `socialPostVariant` is the per-platform, schedulable, publishable unit. The
 * variant is the source of truth for scheduled time and status.
 */

export const SOCIAL_PLATFORMS = [
  'linkedin',
  'bluesky',
  'x',
  'facebook',
  'instagram',
  'threads',
  'mastodon',
] as const

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  linkedin: 'LinkedIn',
  bluesky: 'Bluesky',
  x: 'X',
  facebook: 'Facebook',
  instagram: 'Instagram',
  threads: 'Threads',
  mastodon: 'Mastodon',
}

/**
 * The variant state machine (#786 + #788):
 *
 *   draft → scheduled → publishing → published | failed
 *           scheduled → awaiting-manual → published
 *           failed → scheduled            (organizer re-schedules)
 *
 * `publishing` is a CLAIM held by one cron tick; a stale claim surfaces as
 * `failed` and is never re-posted (double-post safety).
 */
export const VARIANT_STATUSES = [
  'draft',
  'scheduled',
  'publishing',
  'awaiting-manual',
  'published',
  'failed',
] as const

export type VariantStatus = (typeof VARIANT_STATUSES)[number]

/** What an attempt at publishing ended as (lands in `attempts[]`). */
export type AttemptOutcome =
  | 'published'
  | 'manual'
  | 'credential-expired'
  | 'rate-limited'
  | 'rejected'
  | 'transient'
  | 'ambiguous'
  | 'stale-claim'

export interface PublishAttempt {
  _key: string
  /** ISO datetime. */
  at: string
  outcome: AttemptOutcome
  error?: string
  /** Speaker id for a manual "mark as posted". */
  by?: string
}

export interface PublishResult {
  externalId?: string
  url?: string
}

/** The variant slice every orchestration decision reads. */
export interface SocialPostVariant {
  _id: string
  _rev: string
  postId: string
  conferenceId: string
  platform: SocialPlatform
  body: string
  status: VariantStatus
  /** ISO datetime, denormalized effective time; null while unscheduled. */
  scheduledAt: string | null
  usesCustomTime: boolean
  /** ISO datetime of the current `publishing` claim. */
  claimedAt: string | null
  link: string | null
  publishResult: PublishResult | null
  attempts: PublishAttempt[]
}

/** The list-view projection for the admin variant table. */
export interface SocialPostVariantListItem extends Omit<
  SocialPostVariant,
  '_rev' | 'claimedAt'
> {
  postBody: string
  updatedAt: string | null
}
