import { csvDocument } from '@/lib/csv'
import type { ReportView } from './report/types'

const COLUMNS = [
  'Row type',
  'Snapshot ID',
  'Observation date',
  'Taken at',
  'Campaign ID',
  'Campaign key',
  'Campaign title',
  'Outcome',
  // The WINDOW and TARGET the reading was measured against. The export already
  // carried the preserved key, title and Outcome, but not these — and report
  // aggregation deliberately segments values by their stored window, so rows
  // measured under different windows or goals were indistinguishable in the one
  // surface that is meant to be the raw audit record. After the Campaign is
  // deleted they are the only remaining trace of what the number meant.
  'Measured window start',
  'Measured window end',
  'Measured target',
  'Task ID',
  'Task key',
  'Task title',
  'Channel',
  'Primary outcome',
  'Primary outcome attributed',
  'Attributed primary outcome',
  'Attributed sessions',
  'Checkout click-through',
  'Bluesky interactions',
  'Task sessions',
  'Task combined clicks',
  'Bluesky likes',
  'Bluesky reposts',
  'Bluesky replies',
  'Bluesky quotes',
  'PostHog source',
  'Bluesky source',
] as const

/** Raw daily observations, never weekly folds or summed readings. Blank means unmeasured. */
export function buildReportCsv(report: ReportView): string {
  const campaigns = new Map(
    report.campaigns.map((campaign) => [campaign._id, campaign]),
  )
  const tasks = new Map(report.tasks.map((task) => [task._id, task]))
  const rows: Array<Array<string | number | null>> = []
  for (const snapshot of report.snapshots) {
    const campaign = snapshot.campaignKey
      ? report.campaigns.find((c) => c.key === snapshot.campaignKey)
      : campaigns.get(snapshot.campaign._ref)
    const common = [
      snapshot._id,
      snapshot.date,
      snapshot.takenAt,
      snapshot.campaign._ref,
      snapshot.campaignKey ?? campaign?.key ?? '',
      snapshot.campaignTitle ?? campaign?.title ?? '',
      snapshot.campaignPrimaryOutcome ?? campaign?.primaryOutcome ?? '',
      // BLANK WHEN UNRECORDED — never the live Campaign's current values.
      //
      // These columns claim to describe what the reading was measured against.
      // Falling back to the live Campaign made every row that predates the
      // denormalization carry today's window, and made those "historical"
      // columns change whenever someone edited the Campaign. Migration 052
      // deliberately refuses to invent a window for exactly this reason, and
      // substituting one here would have undone that at the export.
      //
      // A stored null is a real answer too — the Campaign had no target when
      // the reading was taken — so it stays blank rather than borrowing a goal
      // set afterwards.
      snapshot.campaignStartDate ?? '',
      snapshot.campaignEndDate ?? '',
      snapshot.campaignTarget ?? '',
    ]
    const sources = [snapshot.source.posthog, snapshot.source.bluesky]
    rows.push([
      'Campaign',
      ...common,
      '',
      '',
      '',
      '',
      snapshot.primaryOutcomeValue,
      String(snapshot.primaryOutcomeAttributed),
      snapshot.primaryOutcomeAttributedValue,
      snapshot.secondary.attributedSessions,
      snapshot.secondary.checkoutClickThrough,
      snapshot.secondary.blueskyInteractions,
      null,
      null,
      null,
      null,
      null,
      null,
      ...sources,
    ])
    // Rebinding by key only holds WITHIN one incarnation of the Campaign. A
    // plan deleted and reseeded reuses the Template's stable Campaign and Task
    // keys, so this lookup resolved an old observation against the newly seeded
    // Task and the audit export combined the deleted Task's id and historical
    // numbers with the new Task's title and Channel — one row describing two
    // different Tasks. The ledger and the Report already refuse it.
    const sameIncarnation = campaign && snapshot.campaign._ref === campaign._id
    for (const observation of snapshot.perTask) {
      const task =
        observation.taskKey && sameIncarnation
          ? report.tasks.find(
              (t) =>
                t.campaignId === campaign._id && t.key === observation.taskKey,
            )
          : tasks.get(observation.task._ref)
      // The stored weak reference is the identity. An unresolved join must not erase history.
      rows.push([
        'Task',
        ...common,
        observation.task._ref,
        observation.taskKey ?? task?.key ?? '',
        task?.title ?? 'Deleted or unavailable Task',
        task?.channel ?? '',
        null,
        null,
        null,
        null,
        null,
        null,
        observation.sessions,
        observation.clicks,
        observation.blueskyLikes,
        observation.blueskyReposts,
        observation.blueskyReplies,
        observation.blueskyQuotes,
        ...sources,
      ])
    }
  }
  return csvDocument(COLUMNS, rows)
}
