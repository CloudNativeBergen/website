/**
 * The snapshot rail (spec §6.4): the pure engine, its Sanity/vendor wiring, and
 * the conference selection the daily cron sweeps. Both callers — the cron and
 * `marketing.refreshSnapshots` — run the SAME engine.
 */

export { runConferenceSnapshots } from './engine'
export { resolveSnapshotConferences, snapshotDeps } from './sanity'

export { conferenceOrgId } from './org'
export {
  chargeSnapshotRefresh,
  deleteExpiredMarketingRateLimits,
} from './rate-limit'
export type { SnapshotRunResult } from './types'
