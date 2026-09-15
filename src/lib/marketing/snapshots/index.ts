/**
 * The snapshot rail (spec §6.4): the pure engine, its Sanity/vendor wiring, and
 * the conference selection the daily cron sweeps. Both callers — the cron and
 * `marketing.refreshSnapshots` — run the SAME engine.
 */

export {
  planRange,
  postUriOf,
  runConferenceSnapshots,
  snapshotDate,
  snapshotDocument,
  snapshotId,
} from './engine'
export {
  MAX_CONFERENCES_PER_RUN,
  MAX_MUTATIONS_PER_TRANSACTION,
  firstPublishedAt,
  markPlanSnapshotted,
  readExistingSnapshots,
  readProposalOutcomes,
  readSnapshotPlan,
  readTicketOutcomes,
  resolveSnapshotConferences,
  snapshotDeps,
  writeSnapshots,
} from './sanity'
export type { SnapshotConference } from './sanity'
export { conferenceOrgId } from './org'
export {
  MARKETING_RATE_LIMIT_TYPE,
  SNAPSHOT_REFRESH_RULES,
  chargeSnapshotRefresh,
  deleteExpiredMarketingRateLimits,
} from './rate-limit'
export type {
  SnapshotCampaign,
  SnapshotDeps,
  SnapshotDocument,
  SnapshotPlan,
  SnapshotRunResult,
  SnapshotTask,
  SourceStatus,
} from './types'
