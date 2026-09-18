import { ATTRIBUTION_TAIL_DAYS, conferenceDay } from '../outcomes'
import { addDaysToDate } from '../materialize'
import type { StoredPlanView } from '../sanity'
import type { CampaignView, TaskView } from '../types'
import type {
  ReportInput,
  ReportSnapshot,
  ReportView,
  ReportTask,
  ReportMeasurement,
} from './types'
import {
  canonicalSnapshots,
  foldGrain,
  sameMeasurementBasis,
  weekStart,
  sameTaskMeasurementBasis,
  lastObservation,
  metricSegments,
} from './grain'

export const REPORT_SEMANTICS =
  'The range selects stored observation dates, not activity within the range. Summary and ranking use the last measured cumulative or all-time value per field in this range. Missing readings retain earlier measurements and may be stale. Campaign totals can overlap and are not unique edition totals. Campaign bands show current windows; readings retain the windows measured.'
export const REPORT_RANKING =
  'Top ten Tasks ranked by last measured cumulative combined clicks (CFP, sponsor and checkout), then sessions; unmeasured clicks rank last.'
/**
 * `observationDates` is the stored observation dates, NOT the Snapshots: only
 * the oldest and the newest are ever read, so the caller fetches two strings
 * rather than every Snapshot ever taken.
 */
export function reportRange(
  campaigns: CampaignView[],
  fallback: string,
  input: ReportInput,
  observationDates: string[] = [],
) {
  const starts = campaigns
    .map((c) => c.startDate)
    .filter(Boolean)
    .sort()
  const ends = campaigns
    .map((c) => c.endDate)
    .filter(Boolean)
    .sort()
  const dates = [...observationDates].sort()
  const defaultFrom = [starts[0] ?? fallback, dates[0]]
    .filter(Boolean)
    .sort()[0]
  const campaignTo = addDaysToDate(
    ends.at(-1) ?? fallback,
    ATTRIBUTION_TAIL_DAYS + 1,
  )
  const defaultTo = [
    campaignTo,
    dates.length ? addDaysToDate(dates.at(-1)!, 1) : campaignTo,
  ]
    .sort()
    .at(-1)!
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
/** An aggregate is only as recent as its oldest constituent measurement. */
function aggregateMeasurement(values: ReportMeasurement[]): ReportMeasurement {
  return {
    observationDate: values.every((value) => value.observationDate !== null)
      ? (values.map((value) => value.observationDate!).sort()[0] ?? null)
      : null,
    stale: values.some((value) => value.stale),
  }
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
  const { plan, range } = input
  const snapshots = canonicalSnapshots(input.snapshots)
  // THE OLDEST READING THAT IS STILL AS FRESH AS THE SYSTEM CAN PRODUCE.
  //
  // A snapshot covers the last COMPLETED conference day, so the run on day D
  // stamps D-1 (`snapshotDate`). The run is nightly, at 06:20 Oslo — so from
  // Oslo midnight until then, the newest reading in existence is dated D-2 and
  // nothing is wrong. Comparing against D-1 therefore annotated every Campaign
  // card, and every PDF series, with "may be stale" for about six hours every
  // single day, on data that was perfectly current.
  //
  // The slack is one day rather than a clock comparison on purpose: the run
  // time lives in vercel.json and pinning the report's arithmetic to it would
  // couple this model to a deploy config it cannot see. The cost is one day of
  // sensitivity — a night the cron genuinely missed shows up the following
  // morning instead of the same afternoon — which is the right trade against a
  // warning that cried wolf on every card, daily.
  const freshEnough = addDaysToDate(input.today, -2)
  const campaigns = plan?.campaigns ?? []
  const tasks = plan?.tasks ?? []
  const matches = (s: ReportSnapshot, c: CampaignView) =>
    s.campaignKey ? s.campaignKey === c.key : s.campaign._ref === c._id
  const summarize = (campaign: CampaignView) => {
    const rows =
      metricSegments(snapshots.filter((s) => matches(s, campaign))).at(-1) ?? []
    const last = lastObservation(rows)
    const measured = rows
      .filter((s) => s.primaryOutcomeValue !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1)
    // Window and outcome come from the Snapshot because they describe what the
    // number MEASURED — the comparison logic reads them to refuse comparing
    // across differing windows, and a value must keep the metric's name.
    //
    // `target` does not: a target is a GOAL the organizer sets, not a property
    // of a past reading. Taking it from the Snapshot meant raising a Target
    // showed yesterday's figure until the next nightly snapshot landed, so the
    // organizer changed the goal and the Report argued. The live Campaign owns
    // it; the denormalized copy serves RETIRED Campaigns, which have no live
    // document left to ask.
    // ...EXCEPT when the metric itself changed. A target is a goal FOR a
    // metric, so the live one belongs to the Outcome the Campaign carries now,
    // while `value` and `primaryOutcome` above describe the reading that was
    // actually taken. Pairing them rendered the old metric's number against
    // the new metric's goal — "CFP submissions 137 / 400 target" where 400 is
    // a ticket target — with nothing on the card saying so, because a single
    // stored reading is a single segment and `metricChanged` stays false. The
    // reading's own stored target keeps the pair coherent until tonight's run.
    const outcomeChanged =
      !!last?.campaignPrimaryOutcome &&
      last.campaignPrimaryOutcome !== campaign.primaryOutcome
    return {
      ...campaign,
      startDate: last?.campaignStartDate ?? campaign.startDate,
      endDate: last?.campaignEndDate ?? campaign.endDate,
      primaryOutcome: last?.campaignPrimaryOutcome ?? campaign.primaryOutcome,
      target: outcomeChanged ? (last.campaignTarget ?? null) : campaign.target,
      outcomeChanged,
      value: last?.primaryOutcomeValue ?? null,
      attributedValue: last?.primaryOutcomeAttributedValue ?? null,
      observationDate: measured?.date ?? null,
      stale:
        !!last &&
        (!measured || measured.date !== last.date || last.date < freshEnough),
    }
  }
  const summary = campaigns.map(summarize)
  const retiredKeys = [
    ...new Set(
      snapshots
        .filter((s) => s.campaignKey && !campaigns.some((c) => matches(s, c)))
        .map((s) => s.campaignKey!),
    ),
  ]
  const retired = retiredKeys.flatMap((key) => {
    const rows = snapshots.filter((s) => s.campaignKey === key)
    const last = rows.at(-1)!
    if (!last.campaignPrimaryOutcome) return []
    return [
      {
        ...summarize({
          _id: last.campaign._ref,
          key,
          title: last.campaignTitle ?? key,
          primaryOutcome: last.campaignPrimaryOutcome,
          target: last.campaignTarget ?? null,
          startDate: last.campaignStartDate ?? rows[0].date,
          endDate: last.campaignEndDate ?? last.date,
          provisional: false,
          optional: false,
          startMilestone: 'CONFERENCE_START',
          endMilestone: 'CONFERENCE_START',
        }),
        retired: true,
      },
    ]
  })
  const taskRows: ReportTask[] = campaigns.flatMap((campaign) => {
    // Segmented by the PER-TASK basis, not the Outcome's. Sessions, clicks and
    // Bluesky engagement per Task come from the attributed window alone, so an
    // Outcome edit does not invalidate them — and taking the last Outcome
    // segment threw away every per-Task number measured before the edit, so
    // `topTasks` and the Channel funnel showed a Task with 71 measured clicks
    // as unmeasured and ranked it last.
    // ...and only readings taken against THIS Campaign document. `matches`
    // joins on the stable key so history survives a Campaign being deleted —
    // but a plan deleted and reseeded from the Template recreates Campaigns
    // with those same keys, so the previous plan's rows matched here too and
    // the `taskKey` lookup below handed their sessions and clicks to the
    // freshly seeded Task that reused the key. A never-published draft then
    // appeared in Top Tasks and the Channel funnel carrying last cycle's
    // numbers. The ledger already drops them for exactly this reason; the
    // campaign-level figures are real history for the key and are kept there
    // and here, but a per-Task row measured a Task that no longer exists.
    // NOT segmented: every row goes to `lastObservation`, which resets the
    // window-bound fields at a basis change and carries the windowless ones
    // past it. Taking the last segment threw the earlier rows away before that
    // could happen, so per-Task Bluesky engagement — read off the published
    // posts' all-time counters, with no window consulted — was lost to a window
    // edit along with sessions and clicks.
    const rows = snapshots.filter(
      (s) => matches(s, campaign) && s.campaign._ref === campaign._id,
    )
    const last = lastObservation(rows, sameTaskMeasurementBasis)
    return (last?.perTask ?? []).map((row) => {
      const task = tasks.find(
        (t) =>
          t.campaignId === campaign._id &&
          (row.taskKey ? t.key === row.taskKey : t._id === row.task._ref),
      )
      const measurement = (
        field:
          | 'sessions'
          | 'clicks'
          | 'blueskyLikes'
          | 'blueskyReposts'
          | 'blueskyReplies'
          | 'blueskyQuotes',
      ): ReportMeasurement => {
        const observationDate =
          rows
            .filter((snapshot) =>
              snapshot.perTask.some(
                (value) =>
                  (row.taskKey
                    ? value.taskKey === row.taskKey
                    : value.task._ref === row.task._ref) &&
                  value[field] !== null,
              ),
            )
            .map((snapshot) => snapshot.date)
            .sort()
            .at(-1) ?? null
        return {
          observationDate,
          stale:
            observationDate === null ||
            observationDate !== last?.date ||
            observationDate < freshEnough,
        }
      }
      return {
        taskId: task?._id ?? row.task._ref,
        title: task?.title ?? 'Deleted Task',
        campaignId: campaign._id,
        campaignTitle: campaign.title,
        channel: task?.channel ?? null,
        sessions: row.sessions,
        clicks: row.clicks,
        sessionsMeasurement: measurement('sessions'),
        clicksMeasurement: measurement('clicks'),
        blueskyInteractionsMeasurement: aggregateMeasurement([
          measurement('blueskyLikes'),
          measurement('blueskyReposts'),
          measurement('blueskyReplies'),
          measurement('blueskyQuotes'),
        ]),
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
      sessionsMeasurement: aggregateMeasurement(
        rows.map((t) => t.sessionsMeasurement),
      ),
      clicksMeasurement: aggregateMeasurement(
        rows.map((t) => t.clicksMeasurement),
      ),
    }
  })
  return {
    conference: input.conference,
    plan: plan?.plan ?? null,
    range,
    semantics: REPORT_SEMANTICS,
    rankingMetric: REPORT_RANKING,
    summary,
    breakdown: [...summary, ...retired],
    channels,
    unavailableStage:
      'Channel-level checkout and primary conversion stages are unavailable: Snapshots have no Channel dimension, no per-Task conversion, and only combined CFP + sponsor + checkout clicks. Sessions and combined clicks are attributed Task totals, not a unique-person funnel.',
    timeline: campaigns.flatMap<ReportView['timeline'][number]>((c) => {
      // FOLD TO THE DISPLAY GRAIN FIRST, then segment the folded points.
      //
      // Segmenting the daily rows first put each basis change in its own
      // segment before `foldGrain` ever saw them, so its bucket-by-week-first
      // rule could not do its job: a Campaign whose window changed and changed
      // back inside ONE week produced three series, each contributing a single
      // point at the same x. Folding first collapses the week — `foldGrain`
      // already keeps only the rows sharing the basis in force at the week's
      // end, so nothing is mixed across bases — and the segments are then over
      // points the chart actually draws. Daily grain is unaffected: folding at
      // that grain is just canonicalization.
      const own = snapshots.filter((s) => matches(s, c))
      const folded = foldGrain(own, range.grain)
      const segments = metricSegments(folded)
      if (!segments.length)
        return [
          {
            campaignId: c._id,
            title: c.title,
            outcome: c.primaryOutcome,
            metricChanged: false,
            points: [],
          },
        ]
      return segments.map((rows, index) => ({
        campaignId: c._id,
        title: c.title,
        outcome: rows[0].campaignPrimaryOutcome ?? c.primaryOutcome,
        // A new segment can start for two reasons, and they read very
        // differently to an organizer. Only say the Outcome changed when it
        // actually did; a window edit on a window-sensitive Outcome restarts
        // the series without renaming the metric.
        metricChanged:
          index > 0 &&
          segments[index - 1][0].campaignPrimaryOutcome !==
            rows[0].campaignPrimaryOutcome,
        windowChanged:
          index > 0 &&
          segments[index - 1][0].campaignPrimaryOutcome ===
            rows[0].campaignPrimaryOutcome,
        // Measured from the DAILY rows on this segment's basis, not from the
        // folded points. A weekly point is dated the end of its bucket and
        // carries the last value measured inside it, so reading the date off
        // the fold reports when the point sits rather than when the number was
        // taken — and the label next to it says the reading may be stale.
        measurement: (() => {
          // Bounded by THIS segment's own span, not merely by its basis. A
          // Campaign whose basis goes A → B → A has two A segments, and
          // matching on basis alone let the earlier chart borrow the later
          // one's observation date — a date after its own final point, and one
          // fresh enough to clear the staleness threshold it should have failed.
          // `rows` are the FOLDED points, so a weekly row is dated the END of
          // its bucket; the lower bound has to be that bucket's start or the
          // daily reading the point carries falls outside its own segment.
          const from =
            range.grain === 'weekly' ? weekStart(rows[0].date) : rows[0].date
          const to = rows[rows.length - 1].date
          const measured = own
            .filter(
              (s) =>
                s.primaryOutcomeValue !== null &&
                sameMeasurementBasis(s, rows[0]) &&
                s.date >= from &&
                s.date <= to,
            )
            .map((s) => s.date)
            .sort()
            .at(-1)
          return {
            observationDate: measured ?? null,
            stale: (measured ?? '') < freshEnough,
          }
        })(),
        points: rows.map((s) => ({
          date: s.date,
          value: s.primaryOutcomeValue,
          stale:
            s.primaryOutcomeValue !== null &&
            snapshots.find((raw) => raw._id === s._id)?.primaryOutcomeValue ===
              null,
        })),
      }))
    }),
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
    // THE RAW ROWS, not the canonicalized ones. This field feeds only the CSV,
    // which is the audit export — "Raw daily observations", one line per stored
    // document. `canonicalSnapshots` keeps one row per campaignKey:date,
    // preferring the later `takenAt`, which is right for a chart and wrong
    // here: a manual refresh, or a plan deleted and reseeded from the template
    // on the same day (same stable key, new Campaign `_id`, so a second
    // snapshot document), leaves two real stored readings for that key and day
    // and the export silently emitted only the newer. The earlier one was then
    // unreachable through any surface in the product.
    snapshots: input.snapshots,
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
