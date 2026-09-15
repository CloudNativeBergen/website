import type { SocialPlatform } from '../types'

/**
 * The per-platform publish adapter contract (dashboard #788), in the house
 * pattern of docs/INTEGRATION_ADAPTERS.md: a neutral interface, one class per
 * platform, credentials INJECTED at construction — nothing ambient inside.
 */

/** How a platform counts a post's length. */
export type LengthCounting = 'characters' | 'graphemes'

/**
 * Plain-data, client-safe descriptor of what a platform accepts. The single
 * source of truth for the composer UI, `validate`, and the adapter itself.
 */
export interface PlatformConstraints {
  maxLength: number
  counting: LengthCounting
  maxImages: number
  /** Accepted image MIME types. */
  imageMimeTypes: readonly string[]
  requiresImage: boolean
  /** Whether every image must carry alt text (Bluesky refuses without). */
  requiresAlt: boolean
  /** Characters a URL costs regardless of its length (X-style); null = literal. */
  urlLengthCost: number | null
  /** Whether a link may appear in the body text (vs. only as an embed). */
  linkInBody: boolean
  /**
   * The aspect ratio (width / height) the platform's feed card crops images
   * to; the rendition function centres that crop on the hotspot. `null` when
   * the platform shows images uncropped.
   */
  imageAspectRatio: number | null
  /** UTF-8 byte cap on the body where the platform has one besides `maxLength`. */
  maxBytes: number | null
  /**
   * The platform's embed slot holds a link card OR images, never both. With
   * a link the card is posted (spec §4.1: the tagged link is its `uri`) and
   * the first image becomes the card's thumbnail; more than one image
   * alongside a link is refused so nothing is dropped silently.
   */
  linkCardDisplacesImages: boolean
}

export interface ValidationIssue {
  field: 'body' | 'media' | 'link'
  message: string
}

export interface PublishMedia {
  /** Public rendition URL (computed Sanity CDN URL, never stored). */
  url: string
  mimeType: string
  alt: string
}

export interface PublishInput {
  text: string
  media: PublishMedia[]
  link?: string
}

export type PublishFailureKind =
  'credential-expired' | 'rate-limited' | 'rejected' | 'transient' | 'ambiguous'

/**
 * Typed outcomes are the API; exceptions are bugs.
 *
 * ADAPTER GUARANTEE: `transient` / `rate-limited` are returned ONLY when the
 * post definitively was not created. Any uncertainty after the create call has
 * fired (timeouts, ambiguous 5xx) is `ambiguous` — that is what preserves the
 * never-double-post invariant.
 */
export type PublishOutcome =
  | { ok: true; externalId: string; url?: string }
  | {
      ok: false
      kind: PublishFailureKind
      /** Lands in the variant's `attempts[]`. */
      message: string
      /** From platform rate-limit headers. */
      retryAfter?: Date
    }

export interface SocialPublishAdapter {
  readonly platform: SocialPlatform
  readonly constraints: PlatformConstraints
  /** Pure. Run live in the editor, at schedule time, and again at publish. */
  validate(input: PublishInput): ValidationIssue[]
  publish(input: PublishInput): Promise<PublishOutcome>
}

// ---------------------------------------------------------------------------
// READING BACK what a published post earned (spec §4.1, #1018)
// ---------------------------------------------------------------------------

/**
 * Deliberately a SEPARATE interface from {@link SocialPublishAdapter}.
 * Publishing needs the organization's credential and must never be constructed
 * speculatively; reading engagement is an unauthenticated public lookup on
 * Bluesky, so a conference with no Bluesky connection at all can still see what
 * its posts did. Keeping the two apart is what lets the snapshot cron hold only
 * the read half.
 */
/**
 * One post's public counters. EVERY counter is nullable: the AppView declares
 * them optional in the lexicon (`app.bsky.feed.defs#postView`), and a counter
 * the vendor omitted is UNKNOWN, not zero — the same rule the Snapshot stores
 * by (spec §2.4, "missing counts are stored as `null`, never `0`").
 */
export interface PostEngagement {
  likes: number | null
  reposts: number | null
  replies: number | null
  quotes: number | null
}

export type EngagementFailureKind =
  /** The vendor throttled us; retry after `retryAfter` when given. */
  | 'rate-limited'
  /** The vendor refused the request (4xx other than throttle). */
  | 'rejected'
  /** Network failure, timeout, or a 5xx — the same read may succeed later. */
  | 'transient'
  /** A 2xx whose body is not the shape this adapter understands. */
  | 'malformed'

/**
 * Typed outcomes are the API; exceptions are bugs. A PARTIAL result is still
 * `ok`: posts the vendor did not return are named in `missing` (deleted,
 * taken down, or never ours) and the caller stores `null` for them rather
 * than inventing a zero.
 */
export type EngagementResult =
  | { ok: true; counts: Map<string, PostEngagement>; missing: string[] }
  | {
      ok: false
      kind: EngagementFailureKind
      message: string
      retryAfter?: Date
    }

export interface SocialEngagementProvider {
  readonly platform: SocialPlatform
  /** The most ids the vendor accepts in one call; the provider batches for you. */
  readonly batchSize: number
  /**
   * Counters for these posts, keyed by the id they were asked for. An empty
   * input is an empty `ok` result and makes no request.
   */
  engagement(ids: string[]): Promise<EngagementResult>
}

/** Sum a set of counters, where "every contributor unknown" stays unknown. */
export function totalEngagement(
  engagements: readonly (PostEngagement | null | undefined)[],
): number | null {
  let total: number | null = null
  for (const engagement of engagements) {
    if (!engagement) continue
    for (const count of [
      engagement.likes,
      engagement.reposts,
      engagement.replies,
      engagement.quotes,
    ]) {
      if (count === null) continue
      total = (total ?? 0) + count
    }
  }
  return total
}
