import type { SocialPlatform } from '../types'

/**
 * The per-platform publish adapter contract (dashboard #788), in the house
 * pattern of docs/INTEGRATION_ADAPTERS.md: a neutral interface, one class per
 * platform, credentials INJECTED at construction — nothing ambient inside.
 */

/** How a platform counts a post's length. */
export type LengthCounting = 'characters' | 'graphemes'

/**
 * WHERE the platform takes the post's link (spec §3.1, #1134):
 *
 *   `body`    — the link is part of the text and nothing else renders it.
 *   `card`    — the platform builds a link card from it (Bluesky's external
 *               embed; posting by hand, the URL in the text is what makes it).
 *   `comment` — the link is posted as the FIRST COMMENT, alone, and must NOT
 *               appear in the body: LinkedIn, an organizer's call for reach.
 *
 * Replaces the earlier `linkInBody` boolean, which could not tell `card` from
 * `comment` — both would have been "not in the body" while only one of them
 * refuses a body that carries the link.
 */
export type LinkPlacement = 'body' | 'card' | 'comment'

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
  /** Where the platform takes the link; see {@link LinkPlacement}. */
  linkPlacement: LinkPlacement
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

/**
 * A tag the variant RECORDED (spec §4.3): the handle as written and the DID
 * it resolved to when it was checked. The adapter posts this DID and never
 * resolves the handle again (spec §4.4, Publish) — two resolutions could
 * disagree, and the one that was checked is the one that must be posted.
 */
export interface PublishMention {
  handle: string
  did: string
}

export interface PublishInput {
  text: string
  media: PublishMedia[]
  link?: string
  /**
   * Recorded mentions. A handle in the text that is not among them is still
   * detected and resolved by the platform adapter as before; one of them
   * whose handle is not in the text creates nothing.
   */
  mentions?: readonly PublishMention[]
}

/**
 * What validation needs to know about the TENANT, which no constraints object
 * can carry: the conference's own `domains[]`. A `comment` platform refuses a
 * body that links to one of them (spec §3.1), and only the request boundary
 * knows which those are. Absent (or empty) the host rule simply does not fire,
 * so a caller that cannot supply it is never wrong — only less helpful.
 */
export interface PublishContext {
  conferenceDomains?: readonly string[]
  /**
   * The platform's own hosting zone (`PLATFORM_DOMAIN_SUFFIX`), which the
   * first-comment rule needs to keep hosted tenants apart. `undefined` means
   * "resolve it from the environment" — right on the server, and `null` in
   * the browser, where that variable does not exist. The editor read carries
   * the server's value so the live editor and the router agree.
   */
  platformZone?: string | null
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
 *
 * Two successful shapes (#1128, spec §3.2), discriminated by `result`:
 *
 * - **published** (the default, and Bluesky's only one): the post is LIVE and
 *   `externalId` is the platform's own id. `result` is optional here so a
 *   synchronous adapter keeps the shape it has always returned.
 * - **accepted**: an asynchronous vendor took the post and will send it later.
 *   All it has answered with is its OWN id — never the platform's — so it goes
 *   in `vendorPostId`, and the variant waits in `submitted` until the confirm
 *   sweep reads it back. Returning this from an adapter whose post is already
 *   live would mark a live post as not-yet-published.
 */
export type PublishOutcome =
  | { ok: true; result?: 'published'; externalId: string; url?: string }
  | { ok: true; result: 'accepted'; vendorPostId: string }
  | {
      ok: false
      kind: PublishFailureKind
      /** Lands in the variant's `attempts[]`. */
      message: string
      /** From platform rate-limit headers. */
      retryAfter?: Date
    }

/**
 * What one read of an accepted post found (#1128, spec §3.2/§3.3). Like
 * {@link PublishOutcome} these are typed answers, not exceptions — and like it,
 * NOTHING here may say "retry the post": the vendor already has it.
 *
 * `unreadable` is OUR failure to ask (timeout, 5xx, throttle), not the post's:
 * it leaves the variant `submitted` until the confirm timeout runs out.
 */
export type ConfirmCheck =
  /** The vendor has not settled it yet. */
  | { state: 'pending' }
  /** Sent. `externalId` is the PLATFORM's id (e.g. `urn:li:share:…`). */
  | { state: 'published'; externalId?: string; url?: string }
  /** The vendor reported an error on the post; its free text rides along. */
  | { state: 'failed'; message: string }
  /** The vendor no longer has the post (`NOT_FOUND`, deleted in its UI). */
  | { state: 'gone' }
  /** We could not read it. Says nothing about the post. */
  | { state: 'unreadable'; message: string }

export interface SocialPublishAdapter {
  readonly platform: SocialPlatform
  readonly constraints: PlatformConstraints
  /** Pure. Run live in the editor, at schedule time, and again at publish. */
  validate(input: PublishInput, context?: PublishContext): ValidationIssue[]
  publish(input: PublishInput): Promise<PublishOutcome>
  /**
   * Read back a post this adapter ACCEPTED (`result: 'accepted'`). Present
   * only on asynchronous adapters — a synchronous one never reaches
   * `submitted`, so the confirm sweep has nothing to ask it. A submitted
   * variant whose adapter cannot answer simply times out as `ambiguous`.
   *
   * Never throws: a failure to ask is `{ state: 'unreadable' }`.
   */
  confirm?(vendorPostId: string): Promise<ConfirmCheck>
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
