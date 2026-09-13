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
  publishResult?: PublishResult
  /** Appended to `attempts[]` (the audit trail). */
  attempt?: Omit<PublishAttempt, '_key'>
}

/**
 * The persistence seam the publish engine runs against. `sanity.ts` is the
 * real implementation; tests use an in-memory one. Keeping the engine off the
 * Sanity client is what lets the tick be tested as a state machine.
 */
export interface SocialVariantStore {
  /** `status == "scheduled" && scheduledAt <= now`, oldest first, bounded. */
  findDueVariants(now: Date, limit: number): Promise<SocialPostVariant[]>
  /** Every variant currently holding a `publishing` claim. */
  findPublishingVariants(): Promise<SocialPostVariant[]>
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
