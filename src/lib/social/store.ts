import type {
  PublishAttempt,
  RecordedTag,
  PublishResult,
  SocialPostAttachment,
  SocialPostVariant,
  VariantStatus,
  VariantSubmission,
} from './types'

/**
 * A due variant as the tick reads it: the variant slice PLUS its post's
 * attachments, so the engine can resolve the renditions an adapter uploads
 * (#1005) without a second read per variant. `postAttachments` is empty
 * when the post is gone or belongs to another conference — a variant that
 * references one then fails validation instead of going out text-only.
 */
export interface PublishableVariant extends SocialPostVariant {
  postAttachments: SocialPostAttachment[]
  /** The conference's `domains[]`: the hosts a link card may be built for. */
  conferenceDomains: string[]
  /**
   * The origin this variant's `/go/<code>` short link is built on — the
   * conference's outbound origin (`conferenceBaseUrl()` over the RAW
   * `domains[]`, the same derivation its tagged `link` was minted with).
   * `null` for a variant with no code, which posts its `link` unchanged.
   */
  shortLinkOrigin: string | null
  /**
   * The organizer who created the post — the assignee a manual variant is
   * handed to (#1006) until the Task layer (#992) carries its own. `null`
   * when the post is gone, cross-tenant, or its creator was erased.
   */
  postCreatedBy: string | null
  /** Live same-conference Task captured before claiming; null proves standalone. */
  marketingTaskId: string | null
  /**
   * Every recorded `tagged` mention with its speaker's opt-out (tagging spec
   * §4.4, Publish), joined in the SAME work read. Absent: the store read no
   * records, and `mentions` is posted as it is.
   */
  recordedTags?: RecordedTag[]
}

/** One state-machine step applied to a variant document. */
export interface VariantTransition {
  status: VariantStatus
  /** ISO datetime; `null` clears. Omitted = untouched. */
  scheduledAt?: string | null
  /** ISO datetime of the claim; `null` clears. Omitted = untouched. */
  claimedAt?: string | null
  /** The vendor receipt (#1128); `null` clears. Omitted = untouched. */
  submission?: VariantSubmission | null
  usesCustomTime?: boolean
  attemptCount?: number
  publishResult?: PublishResult
  /**
   * A `/go/<code>` code backfilled onto a Task variant that predates the
   * field (short-links spec §2.2), written with the transition it rides on.
   * Omitted = untouched; never cleared.
   */
  shortCode?: string
  /**
   * The text actually posted, when it differs from the approved body (a late
   * opt-out's tag swapped for the name, tagging spec §4.4). Written by the
   * same compare-and-set that marks the variant published, so the record
   * never lies about what went out. Omitted = untouched.
   */
  body?: string
  /** Appended to `attempts[]` (the audit trail). */
  attempt?: Omit<PublishAttempt, '_key'> & { _key?: string }
}

/**
 * The persistence seam the publish engine runs against. `sanity.ts` is the
 * real implementation; tests use an in-memory one. Keeping the engine off the
 * Sanity client is what lets the tick be tested as a state machine.
 */
export interface TickWork {
  /**
   * Due variants (`status == "scheduled" && scheduledAt <= now`), oldest
   * first, at most `perConference` PER CONFERENCE across at most
   * `maxConferences` conferences — the fairness bound lives in the read, so a
   * tenant with a deep backlog cannot fill the window.
   */
  due: PublishableVariant[]
  /** `publishing` claims taken before `staleBefore`, bounded. */
  stale: SocialPostVariant[]
  /**
   * Variants an asynchronous vendor accepted and has not settled (#1128),
   * oldest submission first, bounded. Read HERE rather than in a query of
   * their own: the tick runs every minute and each extra read costs ~43k
   * live-API requests a month.
   */
  submitted: SocialPostVariant[]
}

export interface TickWorkBounds {
  perConference: number
  maxConferences: number
  staleLimit: number
  submittedLimit: number
}

export interface SocialVariantStore {
  /**
   * Everything one tick needs, in ONE read: the cron runs every minute, so
   * each extra query here costs ~43k live-API requests a month.
   */
  findWork(
    now: Date,
    staleBefore: Date,
    bounds: TickWorkBounds,
  ): Promise<TickWork>
  /**
   * The recorded tags' speakers as they are NOW (tagging spec §4.4, review
   * T6): read right before a tagged variant's external publish, so an
   * opt-out that landed after `findWork` is still honoured. Only for a
   * variant that carries recorded speaker tags — an idle tick never pays it.
   * A speaker who no longer exists, was erased, or no longer has a talk at
   * this conference (the manual path's roster, round 3 T3) is `gone`.
   */
  tagStates(
    conferenceId: string,
    speakerIds: readonly string[],
  ): Promise<ReadonlyMap<string, { optedOut: boolean; gone: boolean }>>
  /**
   * Every Bluesky handle an opted-out speaker of this conference lists, NOW,
   * normalised (#1154): a sponsor tag of one of them is withheld. Read right
   * before the external call, and only for a variant carrying a sponsor tag.
   */
  optedOutBlueskyHandles(conferenceId: string): Promise<ReadonlySet<string>>
  /**
   * Compare-and-set `scheduled → publishing` on the variant's revision. Returns
   * the claimed variant (fresh `_rev`) or `null` when another tick won the race
   * or the document moved on.
   */
  claim<V extends SocialPostVariant>(variant: V, now: Date): Promise<V | null>
  /**
   * Apply a transition. With `ifRevision` the write is compare-and-set and the
   * result says whether it landed; without, it always lands.
   */
  transition(
    variantId: string,
    transition: VariantTransition,
    options?: { ifRevision?: string },
  ): Promise<boolean>
}
