/**
 * THE DASHBOARD CHIP (speaker feedback spec §9.4): on each of the speaker's
 * confirmed talks in `/cfp/list`, "Feedback Code" until feedback is visible
 * (§6), then "<n>% loved it · <total>" from the shared totals (§4.3).
 *
 * At most three reads per conference: the speaker's talks, the schedule
 * (skipped once the conference is over, when every talk is visible) and the
 * responses of the visible talks only.
 */
import 'server-only'
import { clientReadCached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { getConferenceFeedbackSlots, PUBLISHED_ONLY } from './sanity'
import { talkTotals, type TalkCounts } from './totals'
import { feedbackWindow, isConferenceOverAt, mayMint } from './window'

/** After the conference is over, by when every Feedback Window has closed. */
const ALL_WINDOWS_CLOSED_AFTER_MS = 2 * 24 * 60 * 60 * 1000

export type FeedbackChip =
  { kind: 'code' } | { kind: 'results'; lovedItPercent: number; total: number }

/** Chips by talk id. A talk with no chip is absent. */
export type FeedbackChips = Record<string, FeedbackChip>

export async function getSpeakerFeedbackChips({
  conference,
  speakerId,
  now,
}: {
  conference: { _id: string; endDate?: string | null }
  speakerId: string
  now: Date
}): Promise<FeedbackChips> {
  const scope = { conferenceId: conference._id }
  // Through the CDN: a dashboard chip may lag a fresh answer by a moment,
  // and every dashboard view would otherwise cost live-API quota.
  const talks =
    (await scopedFetch<(TalkCounts & { _id: string })[] | null>(
      clientReadCached,
      scope,
      `*[_type == "talk" && ${PUBLISHED_ONLY} && status == "confirmed" && $speakerId in speakers[]._ref]{
        _id, audienceFeedback, feedbackFolded
      }`,
      { speakerId },
    )) ?? []
  if (talks.length === 0) return {}

  // Two days after the conference is over every window has closed (24 h
  // after a slot on its last day) and every talk is visible, wherever it
  // was scheduled, so the schedule is not read at all. Sooner, a last-day
  // talk with no answers yet still needs its window to keep its code chip.
  const slots = isConferenceOverAt(
    conference.endDate,
    new Date(now.getTime() - ALL_WINDOWS_CLOSED_AFTER_MS),
  )
    ? new Map()
    : await getConferenceFeedbackSlots(conference._id)
  const windows = new Map(
    talks.map((t) => [
      t._id,
      feedbackWindow({
        slots: slots.get(t._id) ?? [],
        conferenceEndDate: conference.endDate,
        now,
      }),
    ]),
  )
  const visibleIds = talks
    .map((t) => t._id)
    .filter((id) => windows.get(id)!.feedbackVisible)

  const rows =
    visibleIds.length === 0
      ? []
      : ((await scopedFetch<{ talk: string; colour: unknown }[] | null>(
          clientReadCached,
          scope,
          `*[_type == "feedbackResponse" && talk._ref in $talkIds && ${PUBLISHED_ONLY}]{
            "talk": talk._ref, colour
          }`,
          { talkIds: visibleIds },
        )) ?? [])

  const chips: FeedbackChips = {}
  for (const t of talks) {
    const window = windows.get(t._id)!
    const { lovedItPercent, total } = window.feedbackVisible
      ? talkTotals(
          t,
          rows.filter((r) => r.talk === t._id),
        )
      : { lovedItPercent: null, total: 0 }
    if (lovedItPercent !== null)
      chips[t._id] = { kind: 'results', lovedItPercent, total }
    // Nothing to show yet: the code, while §5 would still give one and
    // answers can still arrive.
    else if (mayMint(window)) chips[t._id] = { kind: 'code' }
  }
  return chips
}
