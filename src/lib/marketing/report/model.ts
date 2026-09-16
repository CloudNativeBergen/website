import { ATTRIBUTION_TAIL_DAYS, conferenceDay } from '../outcomes'
import { addDaysToDate } from '../materialize'
import type { StoredPlanView } from '../sanity'
import type { CampaignView, TaskView } from '../types'
import type {
  ReportInput,
  ReportSnapshot,
  ReportView,
  ReportTask,
} from './types'
import { foldGrain, lastObservation } from './grain'

export const REPORT_SEMANTICS =
  'The range selects stored observation dates, not activity within the range. Summary and ranking use the last measured cumulative or all-time value per field in this range. Missing readings retain earlier measurements and may be stale. Campaign totals can overlap and are not unique edition totals.'
export const REPORT_RANKING =
  'Top ten Tasks ranked by last measured cumulative combined clicks (CFP, sponsor and checkout), then sessions; unmeasured clicks rank last.'
export function reportRange(
  campaigns: CampaignView[],
  fallback: string,
  input: ReportInput,
) {
  const starts = campaigns
    .map((c) => c.startDate)
    .filter(Boolean)
    .sort()
  const ends = campaigns
    .map((c) => c.endDate)
    .filter(Boolean)
    .sort()
  const defaultFrom = starts[0] ?? fallback
  const defaultTo = addDaysToDate(
    ends.at(-1) ?? fallback,
    ATTRIBUTION_TAIL_DAYS + 1,
  )
  return {
    from: input.from ?? defaultFrom,
    to: input.to ?? defaultTo,
    grain: input.grain ?? 'daily',
    defaultFrom,
    defaultTo,
  }
}
/** Missing any constituent keeps an aggregate unknown, rather than suggesting a dip. */
function measuredSum(values: (number | null)[]): number | null {
  return values.length && values.every((v) => v !== null)
    ? values.reduce<number>((sum, v) => sum + (v ?? 0), 0)
    : null
}
export function planHealth(
  tasks: TaskView[],
  campaigns: CampaignView[],
  today: string,
): ReportView['health'] {
  const open = tasks.filter((t) => !t.complete && t.status !== 'skipped')
  const complete = new Set(
    tasks.filter((t) => t.complete || t.status === 'skipped').map((t) => t._id),
  )
  const end = campaigns
    .map((c) => c.endDate)
    .sort()
    .at(-1)
  return {
    running: !!end && today <= end,
    total: tasks.length,
    complete: tasks.filter((t) => t.complete).length,
    overdue: open.filter(
      (t) => t.date && (conferenceDay(t.date) ?? today) < today,
    ).length,
    waiting: open.filter((t) =>
      t.prerequisiteIds.some((id) => !complete.has(id)),
    ).length,
    failed: open.filter((t) => t.status === 'failed').length,
    unassigned: open.filter((t) => !t.assigneeId).length,
  }
}
export function buildReport(input: {
  conference: ReportView['conference']
  plan: StoredPlanView | null
  snapshots: ReportSnapshot[]
  range: ReportView['range']
  today: string
  milestones?: ReportView['milestones']
}): ReportView {
  const { plan, snapshots, range } = input
  const campaigns = plan?.campaigns ?? []
  const tasks = plan?.tasks ?? []
  const summary = campaigns.map((campaign) => {
    const rows = snapshots.filter((s) => s.campaign._ref === campaign._id)
    const last = lastObservation(rows)
    const measured = rows
      .filter((s) => s.primaryOutcomeValue !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1)
    return {
      ...campaign,
      value: last?.primaryOutcomeValue ?? null,
      attributedValue: last?.primaryOutcomeAttributedValue ?? null,
      observationDate: measured?.date ?? null,
      stale:
        !!last &&
        (!measured ||
          measured.date !== last.date ||
          last.date < addDaysToDate(input.today, -1)),
    }
  })
  const taskRows: ReportTask[] = campaigns.flatMap((campaign) => {
    const last = lastObservation(
      snapshots.filter((s) => s.campaign._ref === campaign._id),
    )
    return (last?.perTask ?? []).map((row) => {
      const task = tasks.find((t) => t._id === row.task._ref)
      return {
        taskId: row.task._ref,
        title: task?.title ?? 'Deleted Task',
        campaignId: campaign._id,
        campaignTitle: campaign.title,
        channel: task?.channel ?? null,
        sessions: row.sessions,
        clicks: row.clicks,
        blueskyInteractions: measuredSum([
          row.blueskyLikes,
          row.blueskyReposts,
          row.blueskyReplies,
          row.blueskyQuotes,
        ]),
      }
    })
  })
  const channels = [
    ...new Set(taskRows.map((t) => t.channel ?? 'Unknown / no Channel')),
  ].map((channel) => {
    const rows = taskRows.filter(
      (t) => (t.channel ?? 'Unknown / no Channel') === channel,
    )
    return {
      channel,
      sessions: measuredSum(rows.map((t) => t.sessions)),
      clicks: measuredSum(rows.map((t) => t.clicks)),
    }
  })
  return {
    conference: input.conference,
    plan: plan?.plan ?? null,
    range,
    semantics: REPORT_SEMANTICS,
    rankingMetric: REPORT_RANKING,
    summary,
    channels,
    unavailableStage:
      'Channel-level checkout and primary conversion stages are unavailable: Snapshots have no Channel dimension, no per-Task conversion, and only combined CFP + sponsor + checkout clicks. Sessions and combined clicks are attributed Task totals, not a unique-person funnel.',
    timeline: campaigns.map((c) => ({
      campaignId: c._id,
      title: c.title,
      outcome: c.primaryOutcome,
      points: foldGrain(
        snapshots.filter((s) => s.campaign._ref === c._id),
        range.grain,
      ).map((s) => ({
        date: s.date,
        value: s.primaryOutcomeValue,
        stale:
          s.primaryOutcomeValue !== null &&
          snapshots.find((raw) => raw._id === s._id)?.primaryOutcomeValue ===
            null,
      })),
    })),
    campaigns,
    milestones: input.milestones ?? {},
    topTasks: taskRows
      .sort(
        (a, b) =>
          (b.clicks ?? -1) - (a.clicks ?? -1) ||
          (b.sessions ?? -1) - (a.sessions ?? -1) ||
          a.taskId.localeCompare(b.taskId),
      )
      .slice(0, 10),
    previousEdition: null,
    health: planHealth(tasks, campaigns, input.today),
    snapshots,
    tasks,
  }
}

/** Same key is necessary but not sufficient. Exact relative windows are required. */
export function comparisonReason(
  current: CampaignView,
  previous: CampaignView,
  currentStart: string,
  previousStart: string,
): string | null {
  if (current.primaryOutcome !== previous.primaryOutcome)
    return 'Different Outcome types'
  if (current.primaryOutcome === 'blueskyInteractions')
    return 'All-time post counters have different post ages'
  // Attribution starts at publication, which the Snapshot does not store.
  if (
    !['cfpSubmissions', 'ticketsSoldInWindow'].includes(current.primaryOutcome)
  )
    return 'First-publication attribution windows are not recorded in Snapshots'
  const offset = (day: string, start: string) =>
    Date.parse(day) - Date.parse(start)
  if (
    offset(current.startDate, currentStart) !==
      offset(previous.startDate, previousStart) ||
    offset(current.endDate, currentStart) !==
      offset(previous.endDate, previousStart)
  )
    return 'Different Campaign windows relative to conference start'
  return null
}
