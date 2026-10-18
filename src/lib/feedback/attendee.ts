/**
 * THE ATTENDEE PAGE'S READ SIDE (speaker feedback spec §5.1, §7.2).
 *
 * `/f/<code>` resolves the conference from the Host and calls
 * {@link resolveFeedbackPage}; everything Sanity is asked comes from ONE cached
 * entry per conference, {@link feedbackCodeIndex}. It holds code → talk for
 * the conference's confirmed, published talks, with each talk's title,
 * speakers and slots, so a page view never reads per talk and a flood of
 * random codes costs nothing. _Implementation detail:_ the spec's "second
 * cached read" for the talk is folded into the index: two reads per
 * conference per refill instead of one per talk.
 *
 * The index is server-only and never handed to a Client Component: it carries
 * the titles and speakers of talks that are not public yet. What leaves this
 * module is a {@link FeedbackPage}, which holds them only when the talk is
 * public, computed per request since it depends on the time. So does the
 * window's closing time: the slot's end gives an unannounced session away as
 * surely as its start (_Refinement_ of §7.2, which names title, speakers and
 * start time).
 */
import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { feedbackCodeIndexTag } from '@/lib/cache/tags'
import { isProgramPublished } from '@/lib/conference/state'
import { normalizeShortCode } from '@/lib/marketing/short-code'
import { clientReadUncached } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { OFFICIAL_SCHEDULE_FILTER } from '@/lib/speaker/sanity'
import { PUBLISHED_ONLY } from './sanity'
import { feedbackWindow, type FeedbackSlot } from './window'

/** One confirmed, published talk that holds a Feedback Code. */
export interface FeedbackTalk {
  talkId: string
  title: string
  speakers: string[]
  slots: FeedbackSlot[]
}

export type FeedbackCodeIndex = ReadonlyMap<string, FeedbackTalk>

/**
 * 5 minutes (§5.1): the backstop for Studio edits that expire nothing. Next's
 * docs require `expire` to be LONGER than `revalidate` (today's check only
 * refuses shorter), so it is one second longer rather than equal: a stricter
 * check in a later Next would otherwise throw on every scan.
 */
export const FEEDBACK_CODE_INDEX_LIFE = {
  stale: 60,
  revalidate: 60 * 5,
  expire: 60 * 5 + 1,
} as const

interface TalkRow {
  _id: string
  feedbackCode: unknown
  title: string | null
  speakers: (string | null)[] | null
}

interface DayRow {
  date: string | null
  slots:
    | {
        talkId: string
        startTime: string | null
        endTime: string | null
      }[]
    | null
}

/**
 * The conference's Feedback Code index, cached per conference under
 * {@link feedbackCodeIndexTag}. `clientReadUncached` inside
 * `'use cache: remote'`: the CDN keeps a cache `revalidateTag` cannot reach,
 * and plain `'use cache'` is per-instance memory.
 *
 * THROWS on a shape it does not recognise, so a bad answer is never cached as
 * "this conference holds no codes".
 */
export async function feedbackCodeIndex(
  conferenceId: string,
): Promise<FeedbackCodeIndex> {
  'use cache: remote'
  cacheLife(FEEDBACK_CODE_INDEX_LIFE)
  cacheTag(feedbackCodeIndexTag(conferenceId))

  const [talks, days] = await Promise.all([
    scopedFetch<unknown>(
      clientReadUncached,
      { conferenceId },
      `*[_type == "talk" && status == "confirmed" && defined(feedbackCode) && ${PUBLISHED_ONLY}]{
        _id, feedbackCode, title, "speakers": speakers[]->name
      }`,
    ),
    scopedFetch<unknown>(
      clientReadUncached,
      { conferenceId },
      `*[_type == "schedule" && ${PUBLISHED_ONLY} && ${OFFICIAL_SCHEDULE_FILTER}]{
        date,
        "slots": tracks[].talks[][defined(talk._ref)]{ "talkId": talk._ref, startTime, endTime }
      }`,
    ),
  ])
  if (!Array.isArray(talks) || !Array.isArray(days)) {
    throw new Error('Unexpected Feedback Code index shape')
  }

  const slotsByTalk = new Map<string, FeedbackSlot[]>()
  for (const day of days as DayRow[]) {
    for (const s of day.slots ?? []) {
      const slots = slotsByTalk.get(s.talkId) ?? []
      slots.push({
        date: day.date,
        startTime: s.startTime ?? null,
        endTime: s.endTime ?? null,
      })
      slotsByTalk.set(s.talkId, slots)
    }
  }

  const index = new Map<string, FeedbackTalk>()
  const ambiguous = new Set<string>()
  for (const row of talks as TalkRow[]) {
    // NORMALIZED, because the page normalizes the scanned code before it asks.
    const code = normalizeShortCode(
      typeof row.feedbackCode === 'string' ? row.feedbackCode : null,
    )
    if (!code) continue
    // Two talks holding one code is data the minter never writes. Sending an
    // attendee to either one could put their answer on the wrong session, so
    // the code resolves to neither.
    if (index.has(code)) ambiguous.add(code)
    index.set(code, {
      talkId: row._id,
      title: row.title ?? '',
      speakers: (row.speakers ?? []).filter(
        (name): name is string => typeof name === 'string',
      ),
      slots: slotsByTalk.get(row._id) ?? [],
    })
  }
  for (const code of ambiguous) index.delete(code)
  return index
}

/** What the page may show about the talk: only ever for a public talk. */
export interface PublicFeedbackTalk {
  title: string
  speakers: string[]
}

export type FeedbackPage =
  | { state: 'unknown' }
  | {
      state: 'open'
      talk: PublicFeedbackTalk | null
      /** Only for a public talk: it gives the slot's end away. */
      closesAt: string | null
    }
  | {
      state: 'not-yet-open'
      talk: PublicFeedbackTalk | null
      /** Only for a public talk with a slot. */
      opensAt: string | null
    }
  | { state: 'closed'; talk: PublicFeedbackTalk | null }

/** The talk a scanned code resolves to, as Submit needs it (§7.4). */
export interface FeedbackTarget {
  talkId: string
  /** The normalized code. */
  code: string
}

/**
 * What a scanned code shows on the conference serving the request (§7.2).
 *
 * A malformed code is Unknown without a read. A code of another tenant, a
 * rotated one, or one on a talk that is not confirmed is not in THIS
 * conference's index, so it is Unknown too, and identical to a code that was
 * never minted.
 *
 * "Public" is the program being published and the talk having a slot on an
 * official schedule. The title, the speakers and the start time appear only
 * then, so an early-shared code cannot reveal an unannounced acceptance.
 */
export async function resolveFeedbackPage(
  conference: FeedbackConference,
  rawCode: string,
  now: Date,
): Promise<FeedbackPage> {
  return (await resolveFeedbackTarget(conference, rawCode, now)).page
}

type FeedbackConference = {
  _id: string
  endDate?: string | null
  programDate?: string | null
}

/**
 * {@link resolveFeedbackPage}, with the talk the code resolves to. The target
 * is server-only: it never reaches the page.
 */
export async function resolveFeedbackTarget(
  conference: FeedbackConference,
  rawCode: unknown,
  now: Date,
): Promise<{ page: FeedbackPage; target: FeedbackTarget | null }> {
  const code = normalizeShortCode(typeof rawCode === 'string' ? rawCode : null)
  if (!code) return { page: { state: 'unknown' }, target: null }

  const entry = (await feedbackCodeIndex(conference._id)).get(code)
  if (!entry) return { page: { state: 'unknown' }, target: null }

  const isPublic = isProgramPublished(conference, now) && entry.slots.length > 0
  const talk = isPublic
    ? { title: entry.title, speakers: entry.speakers }
    : null
  const window = feedbackWindow({
    slots: entry.slots,
    conferenceEndDate: conference.endDate,
    now,
  })

  const target = { talkId: entry.talkId, code }
  switch (window.state) {
    case 'open':
      return {
        page: {
          state: 'open',
          talk,
          closesAt: isPublic ? (window.closesAt ?? null) : null,
        },
        target,
      }
    case 'closed':
      return { page: { state: 'closed', talk }, target }
    default:
      return {
        page: {
          state: 'not-yet-open',
          talk,
          opensAt: isPublic ? (window.opensAt ?? null) : null,
        },
        target,
      }
  }
}
