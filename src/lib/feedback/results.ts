/**
 * A SPEAKER'S SESSION FEEDBACK (speaker feedback spec §4.3, §9.1, §9.3).
 *
 * One scoped query first: the talk, only if it is a published, confirmed
 * talk of the conference serving the request with the caller among its
 * speakers. Anything else is one uniform refusal, decided before a single
 * response is read (guard before fetch). Visibility (§6) is computed here on
 * the server, and hidden comments are dropped here, never in the client.
 */
import 'server-only'
import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import type { FeedbackColour } from './colour'
import { commentOf } from './comment'
import { getFeedbackSlots, PUBLISHED_ONLY } from './sanity'
import { talkTotals, type FeedbackTotals, type TalkCounts } from './totals'
import { feedbackWindow, type FeedbackWindow } from './window'

/**
 * A comment as the talk's speakers see it. `id` is the response's document
 * id, the handle `sessionFeedback.flag` takes (see `./flag`). `flagged`: a
 * speaker of the talk flagged it and no organizer has acted on it yet; every
 * speaker of the talk sees that (§10.3).
 */
export interface SpeakerComment {
  id: string
  colour: FeedbackColour
  comment: string
  submittedAt: string | null
  flagged: boolean
}

export type SpeakerResults =
  | { status: 'refused' }
  | { status: 'ok'; visible: false; window: FeedbackWindow }
  | {
      status: 'ok'
      visible: true
      window: FeedbackWindow
      totals: FeedbackTotals
      /** Visible comments, oldest first. */
      comments: SpeakerComment[]
    }

/**
 * A comment's time to the minute: what speakers are shown, and no more
 * precise, since exact times in a small room hint at who wrote it (§15).
 */
function toMinute(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = Date.parse(value)
  if (Number.isNaN(t)) return null
  return new Date(t - (t % 60_000)).toISOString()
}

interface ResponseRow {
  _id: string
  colour?: unknown
  comment?: unknown
  submittedAt?: unknown
  hiddenAt?: unknown
  flaggedAt?: unknown
}

/**
 * A comment the talk's speakers see (§9.3): not hidden, of a real colour,
 * and not blank. The one rule for the results tab and the summary's count.
 */
export function isVisibleComment(
  r: Pick<ResponseRow, 'colour' | 'comment' | 'hiddenAt'>,
): r is { colour: FeedbackColour; comment: string; hiddenAt?: unknown } {
  return !r.hiddenAt && commentOf(r) !== null
}

/** The talk as {@link readSpeakerTalk} answers it. */
export type SpeakerTalk = TalkCounts & { _id: string; title: string | null }

/**
 * THE ONE SCOPED QUERY the results and the flag start with (§9.1): the talk,
 * only if it is a published, confirmed talk of the conference serving the
 * request with `speakerId` among its speakers; otherwise null, one answer
 * for every reason.
 */
export async function readSpeakerTalk({
  talkId,
  speakerId,
  conferenceId,
}: {
  talkId: string
  speakerId: string
  conferenceId: string
}): Promise<SpeakerTalk | null> {
  const talk = await scopedFetch<SpeakerTalk | null>(
    clientReadUncached,
    { conferenceId },
    `*[_type == "talk" && _id == $talkId && ${PUBLISHED_ONLY} && status == "confirmed" && $speakerId in speakers[]._ref][0]{
      _id, title, audienceFeedback, feedbackFolded
    }`,
    { talkId, speakerId },
    { cache: 'no-store' },
  )
  return talk?._id ? talk : null
}

export async function readSpeakerResults({
  talkId,
  speakerId,
  conference,
  now,
}: {
  talkId: string
  speakerId: string
  conference: { _id: string; endDate?: string | null }
  now: Date
}): Promise<SpeakerResults> {
  const scope = { conferenceId: conference._id }
  const talk = await readSpeakerTalk({
    talkId,
    speakerId,
    conferenceId: conference._id,
  })
  if (!talk) return { status: 'refused' }

  const window = feedbackWindow({
    slots: await getFeedbackSlots(conference._id, talk._id),
    conferenceEndDate: conference.endDate,
    now,
  })
  if (!window.feedbackVisible) return { status: 'ok', visible: false, window }

  const rows = await scopedFetch<ResponseRow[] | null>(
    clientReadUncached,
    scope,
    `*[_type == "feedbackResponse" && talk._ref == $talkId && ${PUBLISHED_ONLY}] | order(submittedAt asc, _id asc){
      _id, colour, comment, submittedAt, hiddenAt, flaggedAt
    }`,
    { talkId: talk._id },
    { cache: 'no-store' },
  )
  const responses = rows ?? []
  const comments: SpeakerComment[] = []
  for (const r of responses) {
    if (!isVisibleComment(r)) continue
    comments.push({
      id: r._id,
      colour: r.colour,
      comment: r.comment,
      submittedAt: toMinute(r.submittedAt),
      flagged: !!r.flaggedAt,
    })
  }
  return {
    status: 'ok',
    visible: true,
    window,
    totals: talkTotals(talk, responses),
    comments,
  }
}
