import type { Conference } from '@/lib/conference/types'
import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch, scopedQuery } from '@/lib/sanity/scoped'
import { osloTodayDateString } from '@/lib/time'
import { getPlanView } from '../sanity'
import { getCopySources, type CopySourceOption } from '../copy-sanity'
import { conferenceOrgId } from '../snapshots'
import { resolveAllMilestones } from '../milestones'
import { buildReport, comparisonReason, reportRange } from './model'
import type { ReportInput, ReportSnapshot, ReportView } from './types'

export async function readReportSnapshots(
  conferenceId: string,
  from: string,
  to: string,
): Promise<ReportSnapshot[]> {
  // scopedFetch deliberately permits empty scopes; this boundary must not.
  if (!conferenceId) throw new Error('Report requires a conference scope')
  return (
    (await scopedFetch<ReportSnapshot[]>(
      clientReadUncached,
      { conferenceId },
      `*[_type == "marketingSnapshot" && date >= $from && date < $to && !(_id in path("drafts.**")) && !(_id in path("versions.**"))] | order(date asc, takenAt asc){
      _id, _type, campaign, campaignKey, campaignTitle, campaignPrimaryOutcome, campaignTarget, campaignStartDate, campaignEndDate, conference, date, primaryOutcomeValue, primaryOutcomeAttributed,
      primaryOutcomeAttributedValue, secondary, perTask, source, takenAt
    }`,
      { from, to },
      { cache: 'no-store' },
    )) ?? []
  )
}
/**
 * The oldest and newest stored observation dates, as two strings.
 *
 * `reportRange` widens its defaults around preserved history, and reads only
 * `dates[0]` and `dates.at(-1)` to do it. Handing it the whole corpus to get
 * those two values meant every Report render, CSV export and PDF export pulled
 * every Snapshot ever taken — with its `perTask[]` array — on an uncached
 * client, and narrowing the date range did not reduce it, which is the opposite
 * of what the control implies. For an edition with ten Campaigns and a year of
 * nightly runs that is a few thousand documents against a metered live-API
 * quota, to compute two dates.
 */
export async function readSnapshotDateBounds(
  conferenceId: string,
  /**
   * Keys of the Campaigns that still exist. The NEWEST bound is taken from
   * readings that match none of them — preserved history for a Campaign that
   * has been deleted — because a live Campaign's own nightly readings run on
   * for as long as the plan does and would push the default end forward for
   * ever. Empty means every reading counts, which is right when no Campaign is
   * left to define an end.
   */
  liveCampaignKeys: readonly string[],
): Promise<string[]> {
  if (!conferenceId) throw new Error('Report requires a conference scope')
  // TWO VALUES, sliced in GROQ. Returning the ordered date column and taking
  // its ends in JS still transferred one row per stored Snapshot — thousands
  // for an edition with a year of nightly runs — on every Report render and
  // every export, which is most of what this read was introduced to avoid.
  //
  // Each root is scoped on its own: `scopedQuery` injects the tenant predicate
  // into the FIRST `*[` it finds, so two roots under one `scopedFetch` would
  // have left the second reading every conference's Snapshots.
  const rows = `_type == "marketingSnapshot" && defined(date) && !(_id in path("drafts.**")) && !(_id in path("versions.**"))`
  // groq-global-scoped: scopedQuery injects the conference predicate into this root.
  const oldestQuery = `*[${rows}] | order(date asc)[0].date`
  // groq-global-scoped: scopedQuery injects the conference predicate into this root.
  const newestQuery = `*[${rows} && !(campaignKey in $liveKeys)] | order(date desc)[0].date`
  const oldest = scopedQuery({ conferenceId }, oldestQuery)
  const newest = scopedQuery({ conferenceId }, newestQuery)
  const bounds = await clientReadUncached.fetch<{
    first: string | null
    last: string | null
  } | null>(
    `{"first": ${oldest}, "last": ${newest}}`,
    { conferenceId, liveKeys: liveCampaignKeys },
    { cache: 'no-store' },
  )
  return [bounds?.first, bounds?.last].filter((date): date is string => !!date)
}
export function previousSource(
  sources: CopySourceOption[],
  currentStart: string,
): CopySourceOption | null {
  return (
    sources
      .filter((s) => s.startDate && s.startDate < currentStart)
      .sort((a, b) => b.startDate!.localeCompare(a.startDate!))[0] ?? null
  )
}

export async function loadReport(
  conference: Conference,
  input: ReportInput,
): Promise<ReportView> {
  if (!conference._id) throw new Error('Report requires a conference scope')
  const plan = await getPlanView(conference._id)
  const today = osloTodayDateString()
  // History may predate every surviving Campaign, including when the plan is
  // gone, so the default range has to be widened around it — but that needs
  // only the oldest and newest stored dates, which is a one-field read. The
  // documents themselves are then fetched for the resolved range alone, so
  // narrowing the range actually narrows the query.
  const bounds = await readSnapshotDateBounds(
    conference._id,
    (plan?.campaigns ?? []).map((c) => c.key),
  )
  const range = reportRange(
    plan?.campaigns ?? [],
    conference.startDate || today,
    input,
    bounds,
  )
  const snapshots = await readReportSnapshots(
    conference._id,
    range.from,
    range.to,
  )
  let milestones: ReportView['milestones'] = {}
  // A missing plan can coexist with incomplete conference settings.
  if (plan) milestones = resolveAllMilestones(conference)
  const report = buildReport({
    conference: { id: conference._id, title: conference.title },
    plan,
    snapshots,
    range,
    today,
    milestones,
  })
  if (!plan) return report
  const orgId = await conferenceOrgId(conference._id)
  if (!orgId) return report
  const source = previousSource(
    await getCopySources(orgId, conference._id),
    conference.startDate,
  )
  if (!source) return report
  const priorPlan = await getPlanView(source.conferenceId)
  if (!priorPlan) return report
  // The prior edition gets the same treatment as the current one. Built from
  // its surviving Campaign windows alone, this range excluded preserved
  // observations that fall outside them — after that plan was reseeded, or a
  // window moved — so opening the previous edition's own report showed readings
  // that its own comparison here reported as missing.
  const priorRange = reportRange(
    priorPlan.campaigns,
    source.startDate!,
    {},
    await readSnapshotDateBounds(
      source.conferenceId,
      priorPlan.campaigns.map((c) => c.key),
    ),
  )
  const priorSnapshots = await readReportSnapshots(
    source.conferenceId,
    priorRange.from,
    priorRange.to,
  )
  const prior = buildReport({
    conference: { id: source.conferenceId, title: source.conferenceTitle },
    plan: priorPlan,
    snapshots: priorSnapshots,
    range: priorRange,
    today,
  })
  report.previousEdition = {
    title: source.conferenceTitle,
    campaigns: report.summary.map((current) => {
      const previous = prior.summary.find((c) => c.key === current.key)
      let reason = previous
        ? comparisonReason(
            current,
            previous,
            conference.startDate,
            source.startDate!,
          )
        : 'No Campaign with the same key'
      if (
        !reason &&
        previous &&
        (!current.observationDate ||
          current.observationDate < current.endDate ||
          !previous.observationDate ||
          previous.observationDate < previous.endDate)
      )
        reason = 'Both Campaign windows must have complete observations'
      return {
        key: current.key,
        title: current.title,
        current: current.value,
        previous: previous?.value ?? null,
        comparable: reason === null,
        reason,
      }
    }),
  }
  return report
}
