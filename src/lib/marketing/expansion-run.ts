/**
 * THE DAILY EXPANSION RUN (spec §5.4). For one conference: read each subject
 * list a cadence expands over and deal the new subjects onto their slots, and
 * sweep contracts signed in the last week through the sponsorSigned Trigger —
 * the safety net for an event whose handler failed. Idempotent: everything
 * already generated is on the Campaign markers.
 */

import { addDaysToDate, daysBetween } from './materialize'
import {
  getPlannedConferences,
  getRecentlySignedSponsorIds,
  getSignedSponsorSubject,
  getSubjectList,
  markPlanExpanded,
  type PlannedConference,
} from './generation-sanity'
import {
  runGeneration,
  type GenerationRequest,
  type GenerationResult,
} from './generation'
import type { SubjectList } from './template/types'

export const SUBJECT_LISTS: SubjectList[] = [
  'confirmedSpeakers',
  'scheduledTalks',
  'recordedTalks',
]

/** How far back the sponsor sweep looks for a signed contract. */
const SPONSOR_SWEEP_DAYS = 7
export const MAX_CONFERENCES_PER_RUN = 50
/** The video drip runs three weeks past RECORDINGS_LIVE (fallback END + 2 wk). */
const LAST_WINDOW_DAYS_AFTER_RECORDINGS = 21
const RECORDINGS_FALLBACK_DAYS = 14

export async function runPlanExpansion(
  plan: { planId: string; conferenceId: string },
  now: string,
): Promise<GenerationResult> {
  const { conferenceId } = plan
  // Stamped first, so a conference whose run then fails still goes to the
  // back of the queue rather than blocking every edition behind it. The id
  // is the plan document's own — a plan restored or made in the Studio does
  // not have the seeded `marketingPlan.<conferenceId>` id.
  await markPlanExpanded(plan.planId, now)
  const requests: GenerationRequest[] = []
  for (const list of SUBJECT_LISTS) {
    const subjects = await getSubjectList(conferenceId, list)
    if (subjects.length > 0)
      requests.push({ kind: 'expansion', list, subjects })
  }
  const since = new Date(
    Date.parse(now) - SPONSOR_SWEEP_DAYS * 86_400_000,
  ).toISOString()
  const sponsorIds = await getRecentlySignedSponsorIds(conferenceId, since)
  const sponsors = (
    await Promise.all(
      sponsorIds.map((id) => getSignedSponsorSubject(conferenceId, id)),
    )
  ).filter((s) => s !== null)
  if (sponsors.length > 0) {
    requests.push({
      kind: 'trigger',
      event: 'sponsorSigned',
      subjects: sponsors,
    })
  }
  if (requests.length === 0) return { created: 0, warnings: [] }
  return runGeneration(conferenceId, requests, now)
}

/**
 * Conferences whose plan can still grow: the last recurring window (the
 * video drip) has not closed. The plans waiting longest come first (a plan
 * the cron has never run for waits the longest of all), so the per-run cap
 * is backpressure rather than starvation for the editions beyond it.
 */
export async function resolveExpansionConferences(
  today: string,
): Promise<{ planId: string; conferenceId: string }[]> {
  const rows = await getPlannedConferences()
  return rows
    .filter((r) => {
      if (!r.endDate) return false
      const recordings =
        r.recordingsLiveDate ??
        addDaysToDate(r.endDate, RECORDINGS_FALLBACK_DAYS)
      return (
        daysBetween(
          today,
          addDaysToDate(recordings, LAST_WINDOW_DAYS_AFTER_RECORDINGS),
        ) >= 0
      )
    })
    .sort(
      (a, b) =>
        (a.lastExpandedAt ?? '').localeCompare(b.lastExpandedAt ?? '') ||
        (a.startDate ?? '').localeCompare(b.startDate ?? ''),
    )
    .slice(0, MAX_CONFERENCES_PER_RUN)
    .map((r: PlannedConference) => ({
      planId: r.planId,
      conferenceId: r.conferenceId,
    }))
}
