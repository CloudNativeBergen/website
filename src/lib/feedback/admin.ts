/**
 * THE ORGANIZERS' SESSION FEEDBACK (speaker feedback spec §10.1, §10.3).
 *
 * Every read is published-only (§4.4), scoped to the conference serving the
 * request, and LIVE: the CDN can serve a response a Remove just deleted,
 * which `revalidateTag` cannot reach. Totals come from the one totals
 * function (§4.3). Organizers see every comment, hidden ones included.
 *
 * Every action proves, in ONE read and before any write, that each response
 * id is a published response of a talk of the conference. One id that is
 * not refuses the whole request, and a response of another conference is
 * refused exactly like one that does not exist.
 */
import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { formats, type Format } from '@/lib/proposal/types'
import type { ChartResponse } from './buckets'
import type { SeenResponse } from './bulk-remove'
import { isFeedbackColour, type FeedbackColour } from './colour'
import { expireRemovedFeedbackResponse } from './cache'
import { commentOf } from './comment'
import {
  getConferenceFeedbackSlots,
  getFeedbackSlots,
  PUBLISHED_ONLY,
} from './sanity'
import {
  combineTotals,
  talkTotals,
  type FeedbackTotals,
  type TalkCounts,
} from './totals'
import { feedbackWindow, type FeedbackWindow } from './window'

/** A comment as organizers see it: hidden and flagged ones too. */
export interface AdminFeedbackComment {
  id: string
  colour: FeedbackColour
  comment: string
  submittedAt: string | null
  hidden: boolean
  flagged: boolean
}

export interface AdminFeedbackSession {
  talkId: string
  title: string
  speakers: string[]
  /** The talk's format; null when it has none this app knows. */
  format: Format | null
  /** When its earliest slot on the official schedule starts. */
  slotAt: string | null
  totals: FeedbackTotals
  /** Every comment, oldest first. */
  comments: AdminFeedbackComment[]
}

export interface AdminFeedbackOverview {
  /** All sessions together, through the same totals function. */
  totals: FeedbackTotals
  comments: number
  /** Comments a speaker flagged that no organizer has acted on (§10.3). */
  flagged: number
  sessions: AdminFeedbackSession[]
}

/** A response as one talk's reads project it. */
interface TalkResponseRow {
  _id: string
  colour?: unknown
  comment?: unknown
  submittedAt?: unknown
  hiddenAt?: unknown
  flaggedAt?: unknown
}

/** A response as the conference-wide read projects it, with its talk. */
interface ResponseRow extends TalkResponseRow {
  talk: string | null
}

interface TalkRow extends TalkCounts {
  _id: string
  title?: string | null
  format?: string | null
  speakers?: (string | null)[] | null
}

export async function readAdminFeedback({
  conferenceId,
  now,
}: {
  conferenceId: string
  now: Date
}): Promise<AdminFeedbackOverview> {
  const scope = { conferenceId }
  const rows =
    (await scopedFetch<ResponseRow[] | null>(
      clientReadUncached,
      scope,
      `*[_type == "feedbackResponse" && ${PUBLISHED_ONLY}] | order(submittedAt asc, _id asc){
        _id, "talk": talk._ref, colour, comment, submittedAt, hiddenAt, flaggedAt
      }`,
      {},
      { cache: 'no-store' },
    )) ?? []
  const responded = [
    ...new Set(rows.map((r) => r.talk).filter((t): t is string => !!t)),
  ]
  // Confirmed talks, and any other talk of the conference that still holds
  // responses (a withdrawn one), so its comments can still be moderated.
  const talks =
    (await scopedFetch<TalkRow[] | null>(
      clientReadUncached,
      scope,
      `*[_type == "talk" && ${PUBLISHED_ONLY} && (status == "confirmed" || _id in $responded)] | order(title asc){
        _id, title, format, audienceFeedback, feedbackFolded,
        "speakers": speakers[]->name
      }`,
      { responded },
      { cache: 'no-store' },
    )) ?? []
  const slots = await getConferenceFeedbackSlots(conferenceId)

  const byTalk = new Map<string, ResponseRow[]>()
  for (const r of rows) {
    if (!r.talk) continue
    byTalk.set(r.talk, [...(byTalk.get(r.talk) ?? []), r])
  }

  let flagged = 0
  const sessions = talks.map((t): AdminFeedbackSession => {
    const responses = byTalk.get(t._id) ?? []
    const comments = adminComments(responses)
    flagged += comments.filter((c) => c.flagged).length
    return {
      talkId: t._id,
      title: t.title ?? 'Untitled',
      speakers: (t.speakers ?? []).filter((s): s is string => !!s),
      format: formats.has(t.format as Format) ? (t.format as Format) : null,
      // Where the window opens: the earliest start of the talk's well-formed
      // slots, by the same rule the speaker's window uses (§6).
      slotAt:
        feedbackWindow({
          slots: slots.get(t._id) ?? [],
          conferenceEndDate: null,
          now,
        }).opensAt ?? null,
      totals: talkTotals(t, responses),
      comments,
    }
  })

  return {
    totals: combineTotals(sessions.map((s) => s.totals)),
    comments: sessions.reduce((sum, s) => sum + s.comments.length, 0),
    flagged,
    sessions,
  }
}

/**
 * The rows' comments as organizers see them, in the rows' order: hidden ones
 * too, and a flag only while the comment is not hidden.
 */
function adminComments(
  rows: readonly TalkResponseRow[],
): AdminFeedbackComment[] {
  const comments: AdminFeedbackComment[] = []
  for (const r of rows) {
    const shown = commentOf(r)
    if (!shown) continue
    const hidden = !!r.hiddenAt
    comments.push({
      id: r._id,
      ...shown,
      submittedAt: typeof r.submittedAt === 'string' ? r.submittedAt : null,
      hidden,
      flagged: !!r.flaggedAt && !hidden,
    })
  }
  return comments
}

/** One talk's Session Feedback as its admin panel shows it (§10.2). */
export interface AdminTalkFeedback {
  totals: FeedbackTotals
  /** Every comment, oldest first, hidden ones included. */
  comments: AdminFeedbackComment[]
  /** Every live response with a colour and a time, oldest first. */
  responses: ChartResponse[]
  window: FeedbackWindow
}

/**
 * One talk's Session Feedback for its admin page (§10.2): totals through the
 * one totals function, every comment, and every response's time for the
 * chart Remove-by-range works from. Live and published-only like
 * {@link readAdminFeedback}. `null`, with no response read, unless the talk
 * is a published talk of the conference: a missing talk and another
 * conference's answer alike.
 */
export async function readTalkFeedback({
  conference,
  talkId,
  now,
}: {
  conference: { _id: string; endDate?: string | null }
  talkId: string
  now: Date
}): Promise<AdminTalkFeedback | null> {
  const scope = { conferenceId: conference._id }
  const talk = await scopedFetch<(TalkCounts & { _id: string }) | null>(
    clientReadUncached,
    scope,
    `*[_type == "talk" && _id == $talkId && ${PUBLISHED_ONLY}][0]{
      _id, audienceFeedback, feedbackFolded
    }`,
    { talkId },
    { cache: 'no-store' },
  )
  if (!talk) return null
  const [rows, slots] = await Promise.all([
    scopedFetch<TalkResponseRow[] | null>(
      clientReadUncached,
      scope,
      `*[_type == "feedbackResponse" && talk._ref == $talkId && ${PUBLISHED_ONLY}] | order(submittedAt asc, _id asc){
        _id, colour, comment, submittedAt, hiddenAt, flaggedAt
      }`,
      { talkId },
      { cache: 'no-store' },
    ),
    getFeedbackSlots(conference._id, talkId),
  ])
  const responses = rows ?? []
  return {
    totals: talkTotals(talk, responses),
    comments: adminComments(responses),
    responses: responses.flatMap((r) =>
      isFeedbackColour(r.colour) && typeof r.submittedAt === 'string'
        ? [{ id: r._id, colour: r.colour, submittedAt: r.submittedAt }]
        : [],
    ),
    window: feedbackWindow({
      slots,
      conferenceEndDate: conference.endDate,
      now,
    }),
  }
}

/** At most this many responses per Remove transaction (§10.3). */
export const REMOVE_CHUNK_SIZE = 100

export type ModerationResult =
  { status: 'refused' } | { status: 'ok'; count: number }

/**
 * THE GUARD, before any write: the ids, deduplicated, if EVERY one passes
 * {@link ownedResponseRows}; otherwise null.
 */
async function ownedResponses(
  conferenceId: string,
  responseIds: readonly string[],
): Promise<string[] | null> {
  const ids = [...new Set(responseIds)]
  if (ids.length === 0) return null
  const found = await ownedResponseRows(conferenceId, ids)
  return ids.every((id) => found.has(id)) ? ids : null
}

const isNotFound = (error: unknown) =>
  (error as { statusCode?: unknown } | null)?.statusCode === 404

/** A failed revision guard. */
const isConflict = (error: unknown) =>
  (error as { statusCode?: unknown } | null)?.statusCode === 409

/**
 * Commit Hide's or Unhide's patches. A response deleted between the guard
 * and the commit (the device's own Delete my answer) makes Sanity answer
 * 404 and roll the whole transaction back: that is the same refusal as a
 * response that was never there, not a server error.
 */
async function commitPatches(
  tx: ReturnType<typeof clientWrite.transaction>,
  count: number,
): Promise<ModerationResult> {
  try {
    await tx.commit()
  } catch (error) {
    if (isNotFound(error)) return { status: 'refused' }
    throw error
  }
  return { status: 'ok', count }
}

/** Hide (§10.3): sets `hiddenAt`, clears `flaggedAt`; the colour still counts. */
export async function hideResponses({
  conferenceId,
  responseIds,
  now,
}: {
  conferenceId: string
  responseIds: readonly string[]
  now: Date
}): Promise<ModerationResult> {
  const ids = await ownedResponses(conferenceId, responseIds)
  if (!ids) return { status: 'refused' }
  const tx = clientWrite.transaction()
  for (const id of ids)
    tx.patch(id, (p) =>
      p.set({ hiddenAt: now.toISOString() }).unset(['flaggedAt']),
    )
  return commitPatches(tx, ids.length)
}

/** Unhide (§10.3): clears `hiddenAt`. */
export async function unhideResponses({
  conferenceId,
  responseIds,
}: {
  conferenceId: string
  responseIds: readonly string[]
}): Promise<ModerationResult> {
  const ids = await ownedResponses(conferenceId, responseIds)
  if (!ids) return { status: 'refused' }
  const tx = clientWrite.transaction()
  for (const id of ids) tx.patch(id, (p) => p.unset(['hiddenAt']))
  return commitPatches(tx, ids.length)
}

/**
 * THE ONE GUARD READ every action makes before any write: of the ids, each
 * published response of the conference whose talk is a published talk of
 * the conference, with the revision and time it has now. A missing, draft,
 * release-version or foreign id is left out the same way.
 */
async function ownedResponseRows(
  conferenceId: string,
  ids: readonly string[],
): Promise<Map<string, { rev: string; submittedAt: unknown }>> {
  if (ids.length === 0) return new Map()
  const rows = await scopedFetch<
    { _id: string; _rev: string; submittedAt?: unknown }[] | null
  >(
    clientReadUncached,
    { conferenceId },
    `*[_type == "feedbackResponse" && _id in $ids && ${PUBLISHED_ONLY} && talk->conference._ref == $conferenceId && !(talk._ref in path("drafts.**")) && !(talk._ref in path("versions.**"))]{ _id, _rev, submittedAt }`,
    { ids },
    { cache: 'no-store' },
  )
  return new Map(
    (rows ?? []).map((r) => [
      r._id,
      { rev: r._rev, submittedAt: r.submittedAt },
    ]),
  )
}

/** What a Remove did (§10.3). */
export interface RemoveResult {
  /** `failed`: a chunk failed; `removed` went before it, the rest did not. */
  status: 'ok' | 'failed'
  removed: number
  /** Not (any more) a published response of this conference: skipped. */
  gone: number
  /** Answered again since the organizer saw it, or outside the range: kept. */
  changed: number
}

/** How often a chunk whose revision guard failed is re-planned. */
const MAX_REPLANS = 3

/**
 * REMOVE (§10.2, §10.3), one path for a comment's Remove and a range from
 * the chart: deletes each whole response, colour and comment, in
 * transactions of at most {@link REMOVE_CHUNK_SIZE}, and expires each
 * removed response's tag so `/f/<code>` stops showing it as that device's
 * answer (`revalidateTag`, not `updateTag`: this runs in the tRPC Route
 * Handler). No undo, no log.
 *
 * Exactly the answers the organizer saw. A response's id is the same for
 * every answer from one device (§7.3), so an attendee who answers again
 * while the confirmation is open keeps the id but not the answer: only a
 * response whose `submittedAt` is still the one the page showed (and, for a
 * range, inside it) is deleted, each under the revision the guard read
 * found (Studio's own revision lock: a patch unsetting a pseudo-field under
 * `ifRevisionID`, in the same transaction as the delete). A chunk whose
 * guard fails is re-read BY ID through the doc endpoint (GROQ can lag a
 * write by about a second, and a stale revision would fail every retry) and
 * re-planned without what went or changed, up to {@link MAX_REPLANS} times.
 * Ownership needs no second look: an id that still exists keeps its talk,
 * and a re-pointed reference would have changed its revision.
 *
 * An id that is not a published response of this conference is skipped and
 * counted as gone, never a refusal: an attendee's own Delete my answer must
 * not keep a scripted burst on the page (§15). A foreign id is skipped
 * exactly like a missing one, after the same one read and before any write,
 * so nothing leaks and nothing foreign is deleted.
 */
export async function removeResponses({
  conferenceId,
  responses,
  range,
}: {
  conferenceId: string
  responses: readonly SeenResponse[]
  /** A range from the chart: start inclusive, end exclusive, ISO instants. */
  range?: { from: string; to: string }
}): Promise<RemoveResult> {
  const seen = new Map(responses.map((r) => [r.id, r.submittedAt]))
  const inRange = (submittedAt: unknown) => {
    if (!range) return true
    const at = typeof submittedAt === 'string' ? Date.parse(submittedAt) : NaN
    return at >= Date.parse(range.from) && at < Date.parse(range.to)
  }
  const found = await ownedResponseRows(conferenceId, [...seen.keys()])
  const out: RemoveResult = { status: 'ok', removed: 0, gone: 0, changed: 0 }
  const plan: { id: string; rev: string }[] = []
  for (const [id, saw] of seen) {
    const now = found.get(id)
    if (!now) out.gone++
    else if ((now.submittedAt ?? null) !== saw || !inRange(now.submittedAt))
      out.changed++
    else plan.push({ id, rev: now.rev })
  }

  for (let i = 0; i < plan.length; i += REMOVE_CHUNK_SIZE) {
    let chunk = plan.slice(i, i + REMOVE_CHUNK_SIZE)
    for (let replans = 0; chunk.length > 0; replans++) {
      const tx = clientWrite.transaction()
      for (const { id, rev } of chunk) {
        tx.patch(id, (p) =>
          p.ifRevisionId(rev).unset(['_revision_lock_pseudo_field_']),
        )
        tx.delete(id)
      }
      try {
        await tx.commit()
        out.removed += chunk.length
        for (const { id } of chunk) expireRemovedFeedbackResponse(id)
        break
      } catch (error) {
        const lostGuard = isNotFound(error) || isConflict(error)
        if (!lostGuard || replans >= MAX_REPLANS) {
          console.error('Could not remove Feedback Responses', error)
          // A commit whose reply was lost may have applied. Expiring a
          // response that still exists is harmless; missing one that went
          // is not.
          for (const { id } of chunk) expireRemovedFeedbackResponse(id)
          return { ...out, status: 'failed' }
        }
      }
      // Re-read the chunk by id: drop what went or changed, keep the rest.
      const now = await clientWrite.getDocuments<{ _rev: string }>(
        chunk.map((c) => c.id),
      )
      const revOf = new Map(
        now.filter((d) => d !== null).map((d) => [d._id, d._rev]),
      )
      chunk = chunk.filter(({ id, rev }) => {
        const current = revOf.get(id)
        if (current === undefined) out.gone++
        else if (current !== rev) out.changed++
        return current === rev
      })
    }
  }
  return out
}
