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
  conferenceId: string,
  now: string,
): Promise<GenerationResult> {
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
 * video drip) has not closed. Soonest edition first, bounded per run.
 */
export async function resolveExpansionConferences(
  today: string,
): Promise<string[]> {
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
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''))
    .slice(0, MAX_CONFERENCES_PER_RUN)
    .map((r) => r.conferenceId)
}
