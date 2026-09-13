import type {
  PublishAttempt,
  PublishResult,
  SocialPostVariant,
  VariantStatus,
} from './types'

/** One state-machine step applied to a variant document. */
export interface VariantTransition {
  status: VariantStatus
  /** ISO datetime; `null` clears. Omitted = untouched. */
  scheduledAt?: string | null
  /** ISO datetime of the claim; `null` clears. Omitted = untouched. */
  claimedAt?: string | null
  usesCustomTime?: boolean
  attemptCount?: number
  publishResult?: PublishResult
  /** Appended to `attempts[]` (the audit trail). */
  attempt?: Omit<PublishAttempt, '_key'>
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
  due: SocialPostVariant[]
  /** `publishing` claims taken before `staleBefore`, bounded. */
  stale: SocialPostVariant[]
}

export interface TickWorkBounds {
  perConference: number
  maxConferences: number
  staleLimit: number
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
   * Compare-and-set `scheduled → publishing` on the variant's revision. Returns
   * the claimed variant (fresh `_rev`) or `null` when another tick won the race
   * or the document moved on.
   */
  claim(
    variant: SocialPostVariant,
    now: Date,
  ): Promise<SocialPostVariant | null>
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
