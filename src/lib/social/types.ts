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

/** Storage limits the editor checks live and the router enforces. */
export const SOCIAL_LINK_MAX_LENGTH = 2048
export const SOCIAL_ALT_MAX_LENGTH = 1000

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
 * The variant state machine (#786 + #788, amended by #1128):
 *
 *   draft → scheduled → publishing → published | failed
 *                       publishing → submitted → published | failed
 *           scheduled → awaiting-manual → published
 *           failed → scheduled            (organizer re-schedules)
 *           failed → published            (organizer posts by hand, #1128)
 *
 * `publishing` is a CLAIM held by one cron tick; a stale claim surfaces as
 * `failed` and is never re-posted (double-post safety).
 *
 * `submitted` is the ASYNCHRONOUS half of that claim: a vendor (Buffer) that
 * accepts a post and sends it later has answered with nothing but its own post
 * id. The claim is released, the variant is NOT live yet, and the confirm sweep
 * resolves it. Like `publishing` it is IN FLIGHT: never claimed again, never
 * deleted, never edited.
 */
export const VARIANT_STATUSES = [
  'draft',
  'scheduled',
  'publishing',
  'submitted',
  'awaiting-manual',
  'published',
  'failed',
] as const

export type VariantStatus = (typeof VARIANT_STATUSES)[number]

/** What an attempt at publishing ended as (lands in `attempts[]`). */
export const ATTEMPT_OUTCOMES = [
  'published',
  // An asynchronous vendor ACCEPTED the post (#1128). The SUBMIT leg only —
  // it is deliberately NOT a published outcome: the post is not live yet, and
  // `firstPublishedAt` would be back-dated to the submit if it were.
  'submitted',
  // The cron handed the variant to an organizer (no connection/adapter).
  'awaiting-manual',
  // An organizer marked it posted by hand.
  'manual',
  'credential-expired',
  'rate-limited',
  'rejected',
  'transient',
  'ambiguous',
  'stale-claim',
] as const

export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number]

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

/**
 * An asynchronous vendor's receipt for a post it accepted but has not sent yet
 * (#1128). Deliberately its OWN field: `publishResult.externalId` is reserved
 * for the NATIVE post id (the `urn:li:share:…` that only arrives with the
 * confirmation) and `claimedAt` is cleared when the claim settles, so neither
 * can carry a vendor id that must outlive both.
 */
export interface VariantSubmission {
  /** The vendor's id for the accepted post — what the confirm sweep reads back. */
  vendorPostId: string
  /** ISO datetime the vendor accepted it; the confirm timeout counts from here. */
  submittedAt: string
  /** ISO datetime of the last confirm read; null until the first one. */
  lastCheckedAt: string | null
}

/** A normalized (0–1) crop rectangle over the full source image. */
export interface AttachmentCrop {
  x: number
  y: number
  width: number
  height: number
}

/** One image on the canonical post: an asset reference plus its alt text. */
export interface SocialPostAttachment {
  _key: string
  assetId: string
  /** Source pixel size (from the asset metadata, or parsed from the id). */
  width: number
  height: number
  /** Studio hotspot centre, normalized. */
  hotspot: { x: number; y: number } | null
  /** Studio crop as fractions trimmed from each edge. */
  crop: { top: number; bottom: number; left: number; right: number } | null
  alt: string
}

/** Which post attachment a variant carries, with its per-variant overrides. */
export interface SocialVariantAttachment {
  /** `_key` of the post attachment. */
  source: string
  /** Overrides the platform's default (hotspot-centred) crop. */
  crop: AttachmentCrop | null
  altOverride: string | null
}

/** The variant slice every orchestration decision reads. */
export interface SocialPostVariant {
  _id: string
  _rev: string
  postId: string
  conferenceId: string
  /** The conference's organization — connections and secrets are org-scoped. */
  orgId: string | null
  platform: SocialPlatform
  body: string
  status: VariantStatus
  /** ISO datetime, denormalized effective time; null while unscheduled. */
  scheduledAt: string | null
  usesCustomTime: boolean
  /** ISO datetime of the current `publishing` claim. */
  claimedAt: string | null
  /** The vendor receipt while `submitted`; null otherwise (#1128). */
  submission: VariantSubmission | null
  link: string | null
  /**
   * The `/go/<code>` code for a Task-owned variant (short-links spec §2.1).
   * `null` on a standalone post's variant, and on a Task-owned one that
   * predates the field until its next mutation mints one.
   */
  shortCode: string | null
  attachments: SocialVariantAttachment[]
  publishResult: PublishResult | null
  /** Audit trail: every attempt outcome, never cleared. */
  attempts: PublishAttempt[]
  /**
   * Attempts in the CURRENT scheduling cycle — reset to 0 when an organizer
   * (re-)schedules, incremented by the engine. Drives the retry cap, so a
   * retried variant gets its full budget while `attempts[]` keeps history.
   */
  attemptCount: number
}

/** What the single-variant editor loads: the variant and its post's inputs. */
export interface SocialVariantEditorData {
  variant: SocialPostVariant
  post: {
    attachments: SocialPostAttachment[]
    defaultScheduledAt: string | null
  }
  /**
   * The conference's own `domains[]`, so the editor applies the SAME rules the
   * router applies on save — in particular the first-comment rule (spec §3.1,
   * #1134), which needs to know which hosts are ours.
   */
  conferenceDomains: string[]
  /**
   * The platform's hosting zone as the SERVER resolves it, so the browser's
   * live rule keeps hosted tenants apart exactly as the router does (see
   * `PublishContext.platformZone`). Optional for fixtures; the read sets it.
   */
  platformZone?: string | null
}

/** The list-view row for the admin variant table. */
export interface SocialPostVariantListItem extends SocialPostVariant {
  /** The post's default time, so the schedule dialog can offer "follow it". */
  postDefaultScheduledAt: string | null
  updatedAt: string | null
}
