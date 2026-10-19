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
import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { countColours, type TalkCounts } from './results'
import { getConferenceFeedbackSlots, PUBLISHED_ONLY } from './sanity'
import { feedbackTotals } from './totals'
import { feedbackWindow } from './window'

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
  const talks =
    (await scopedFetch<(TalkCounts & { _id: string })[] | null>(
      clientReadUncached,
      scope,
      `*[_type == "talk" && ${PUBLISHED_ONLY} && status == "confirmed" && $speakerId in speakers[]._ref]{
        _id, audienceFeedback, feedbackFolded
      }`,
      { speakerId },
      { cache: 'no-store' },
    )) ?? []
  if (talks.length === 0) return {}

  // Once the conference is over every talk is visible, wherever it was
  // scheduled, so the schedule is not read at all.
  const over = feedbackWindow({
    slots: [],
    conferenceEndDate: conference.endDate,
    now,
  }).feedbackVisible
  const slots = over
    ? new Map()
    : await getConferenceFeedbackSlots(conference._id)
  const visible = talks.filter(
    (t) =>
      feedbackWindow({
        slots: slots.get(t._id) ?? [],
        conferenceEndDate: conference.endDate,
        now,
      }).feedbackVisible,
  )

  const rows =
    visible.length === 0
      ? []
      : ((await scopedFetch<{ talk: string; colour: unknown }[] | null>(
          clientReadUncached,
          scope,
          `*[_type == "feedbackResponse" && talk._ref in $talkIds && ${PUBLISHED_ONLY}]{
            "talk": talk._ref, colour
          }`,
          { talkIds: visible.map((t) => t._id) },
          { cache: 'no-store' },
        )) ?? [])

  const chips: FeedbackChips = {}
  for (const t of talks) {
    if (!visible.includes(t)) {
      chips[t._id] = { kind: 'code' }
      continue
    }
    const totals = feedbackTotals({
      live: countColours(rows.filter((r) => r.talk === t._id)),
      folded: t.feedbackFolded,
      cards: t.audienceFeedback,
    })
    if (totals.lovedItPercent === null) continue
    chips[t._id] = {
      kind: 'results',
      lovedItPercent: totals.lovedItPercent,
      total: totals.total,
    }
  }
  return chips
}
