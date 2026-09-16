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
    const campaign = campaigns.get(snapshot.campaign._ref)
    const common = [
      snapshot._id,
      snapshot.date,
      snapshot.takenAt,
      snapshot.campaign._ref,
      campaign?.key ?? '',
      campaign?.title ?? '',
      campaign?.primaryOutcome ?? '',
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
    for (const observation of snapshot.perTask) {
      const task = tasks.get(observation.task._ref)
      // The stored weak reference is the identity. An unresolved join must not erase history.
      rows.push([
        'Task',
        ...common,
        observation.task._ref,
        task?.key ?? '',
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
