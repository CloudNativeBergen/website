/**
 * How long a Submit or a code mint may take between checking that a talk
 * may take answers (or a speaker may hold a code) and its write having been
 * sent and its request ended. A speaker erasure waits longer than both
 * (`FEEDBACK_SETTLE_MS`, speaker feedback spec §12.3), so what either admitted
 * before the erasure has landed, and is folded or unset, once.
 *
 * Bounded by the code itself, never by the platform: under Fluid compute an
 * invocation can outlive its `maxDuration`.
 */
/**
 * The `/f/[code]` page's `maxDuration` (a literal there). Not the bound a
 * speaker erasure relies on: under Fluid compute an invocation can outlive
 * it. Submit bounds itself ({@link SUBMIT_WRITE_BOUND_MS}).
 */
export const SUBMIT_MAX_DURATION_S = 30

/** Each Sanity request of a Submit (its talk re-read, its commit) ends by this. */
export const SUBMIT_REQUEST_TIMEOUT_MS = 10_000

/**
 * A Submit writes nothing once this long has passed since its re-read of the
 * talk began: the code it checked may have been unset since (§12.3).
 */
export const SUBMIT_COMMIT_BUDGET_MS = 10_000

/**
 * The longest from a Submit's re-read beginning to its write being sent and
 * its request ended: the budget, then the commit's own cap. A speaker
 * erasure waits longer than this before folding (§12.3).
 */
export const SUBMIT_WRITE_BOUND_MS =
  SUBMIT_COMMIT_BUDGET_MS + SUBMIT_REQUEST_TIMEOUT_MS

/** Each Sanity request of a code mint ends by this. */
export const MINT_REQUEST_TIMEOUT_MS = 10_000

/**
 * A mint commits nothing once this long has passed since it began checking
 * the speaker's liveness: the speaker may have been erased since.
 */
export const MINT_COMMIT_BUDGET_MS = 10_000

/** The longest from a mint's liveness check beginning to its commit ending. */
export const MINT_WRITE_BOUND_MS =
  MINT_COMMIT_BUDGET_MS + MINT_REQUEST_TIMEOUT_MS
