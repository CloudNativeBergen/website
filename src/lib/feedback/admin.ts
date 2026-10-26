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
import { addTally, tallyable } from '@/lib/content-judgement/tally'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { formats, type Format } from '@/lib/proposal/types'
import type { ChartResponse } from './buckets'
import type { SeenResponse } from './bulk-remove'
import {
  FEEDBACK_COLOURS,
  isFeedbackColour,
  type FeedbackColour,
} from './colour'
import { expireRemovedFeedbackResponse } from './cache'
import { commentOf } from './comment'
import {
  getConferenceFeedbackSlots,
  getFeedbackSlots,
  PUBLISHED_ONLY,
} from './sanity'
import { sanityStatus } from '@/lib/sanity/status'
import {
  combineTotals,
  talkTotals,
  type FeedbackTotals,
  type TalkCounts,
} from './totals'
import {
  likelyUnsafe,
  matchesTriage,
  triageCounts,
  type CommentJudgement,
  type CommentKeep,
  type TriageCounts,
  type TriageFilter,
} from './triage'
import { feedbackWindow, type FeedbackWindow } from './window'

/** A comment as organizers see it: hidden and flagged ones too. */
export interface AdminFeedbackComment {
  id: string
  colour: FeedbackColour
  comment: string
  submittedAt: string | null
  hidden: boolean
  flagged: boolean
  /**
   * The response's revision as read: what Keep sends back, so a Keep clears
   * a flag only on the comment exactly as the organizer saw it (§10.3).
   */
  rev: string
  /**
   * Jev's advice (Content judgement spec §7.2, §8.2): `null` for no
   * Judgement, and ALWAYS null while the organization has judgement off
   * (§5) or on `/admin/feedback`, which shows speaker flags only.
   */
  judgement: CommentJudgement | null
  /** An organizer's Keep (§8.2); shown with the advice it ended, so null when that is. */
  kept: CommentKeep | null
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
  _rev?: string
  colour?: unknown
  comment?: unknown
  submittedAt?: unknown
  hiddenAt?: unknown
  flaggedAt?: unknown
  /** The summary (§7.2), when the read asked for it. */
  judgement?: unknown
  keptAt?: unknown
  /** The organizer's name, dereferenced by the read. */
  keptBy?: unknown
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
        _id, _rev, "talk": talk._ref, colour, comment, submittedAt, hiddenAt, flaggedAt
      }`,
      {},
      { cache: 'no-store' },
    )) ?? []
  const responded = [
    ...new Set(rows.map((r) => r.talk).filter((t): t is string => !!t)),
  ]
  // Confirmed talks, and any other talk of the conference that still holds
  // responses (a withdrawn one), so its comments can still be moderated, or
  // whose responses were folded, so its totals still count.
  const talks =
    (await scopedFetch<TalkRow[] | null>(
      clientReadUncached,
      scope,
      `*[_type == "talk" && ${PUBLISHED_ONLY} && (status == "confirmed" || _id in $responded || defined(feedbackFolded))] | order(title asc){
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
  /** Carry Jev's advice and the Keep mark: only while judgement is on (§5). */
  withAdvice = false,
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
      rev: r._rev ?? '',
      judgement: withAdvice ? commentJudgement(r.judgement) : null,
      kept:
        withAdvice && typeof r.keptAt === 'string'
          ? { by: typeof r.keptBy === 'string' ? r.keptBy : null, at: r.keptAt }
          : null,
    })
  }
  return comments
}

/**
 * The stored summary (§7.2) as the page sees it: the state and the reasons,
 * nothing else (not the build, not the tally marker). A shape this code does
 * not recognise reads as no Judgement.
 */
function commentJudgement(summary: unknown): CommentJudgement | null {
  if (typeof summary !== 'object' || summary === null) return null
  const s = summary as Record<string, unknown>
  if (s.state === 'notJudged')
    return {
      state: 'notJudged',
      why: s.notJudgedWhy === 'spendCap' ? 'spendCap' : 'failed',
    }
  if (s.state !== 'judged') return null
  const reasons = (Array.isArray(s.reasons) ? s.reasons : []).flatMap((r) => {
    const reason = r as { question?: unknown; probability?: unknown } | null
    return typeof reason?.question === 'string' &&
      typeof reason.probability === 'number'
      ? [{ question: reason.question, probability: reason.probability }]
      : []
  })
  return { state: 'judged', reasons }
}

/** One talk's Session Feedback as its admin panel shows it (§10.2). */
export interface AdminTalkFeedback {
  totals: FeedbackTotals
  /** Every comment, oldest first, hidden ones included. */
  comments: AdminFeedbackComment[]
  /** Every live response with a colour and a time, oldest first. */
  responses: ChartResponse[]
  /**
   * When the talk last changed (`_updatedAt`, set by the commit), so the
   * panel can tell a read that includes a Card Counts save from one that
   * lags it.
   */
  updatedAt: string | null
  /** The talk's revision as read: exactly which write the read shows. */
  rev: string | null
  window: FeedbackWindow
  /**
   * The triage strip's counts over EVERY comment (Content judgement spec
   * §8.2), whatever `filter` left in `comments`; `null` while the
   * organization has judgement off, when there is no strip.
   */
  triage: TriageCounts | null
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
  judgementOn = false,
  filter,
}: {
  conference: { _id: string; endDate?: string | null }
  talkId: string
  now: Date
  /** The organization has content judgement on: carry the advice (§5). */
  judgementOn?: boolean
  /** The tile the organizer pressed: only those comments come back. */
  filter?: TriageFilter
}): Promise<AdminTalkFeedback | null> {
  const scope = { conferenceId: conference._id }
  const talk = await scopedFetch<
    (TalkCounts & { _id: string; updatedAt?: unknown; rev?: unknown }) | null
  >(
    clientReadUncached,
    scope,
    `*[_type == "talk" && _id == $talkId && ${PUBLISHED_ONLY}][0]{
      _id, audienceFeedback, feedbackFolded,
      "updatedAt": _updatedAt, "rev": _rev
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
        _id, _rev, colour, comment, submittedAt, hiddenAt, flaggedAt,
        judgement, keptAt, "keptBy": keptBy->name
      }`,
      { talkId },
      { cache: 'no-store' },
    ),
    getFeedbackSlots(conference._id, talkId),
  ])
  const responses = rows ?? []
  const comments = adminComments(responses, judgementOn)
  return {
    totals: talkTotals(talk, responses),
    // A tile pressed before the setting went off would otherwise leave an
    // empty list with no strip to clear it.
    comments:
      filter && judgementOn
        ? comments.filter((c) => matchesTriage(c, filter))
        : comments,
    triage: judgementOn ? triageCounts(comments) : null,
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
    updatedAt: typeof talk.updatedAt === 'string' ? talk.updatedAt : null,
    rev: typeof talk.rev === 'string' ? talk.rev : null,
  }
}

/**
 * How many comments speakers flagged that no organizer has acted on: the
 * admin nav's badge (§10.1). The same rule as {@link readAdminFeedback}'s
 * `flagged`: a comment of a known colour, flagged and not hidden. Submit
 * stores a comment trimmed and a blank one as absent (§4.1), so "not empty"
 * here is `commentOf`'s "not blank" for every comment the server wrote (a
 * blank one typed in Studio would count here and not on the page). The
 * talk must be the conference's too, as Keep's guard requires.
 * One live read: the badge must drop as soon as Keep, Hide or Remove lands.
 */
export async function countFlaggedComments(
  conferenceId: string,
): Promise<number> {
  const count = await scopedFetch<number | null>(
    clientReadUncached,
    { conferenceId },
    `count(*[_type == "feedbackResponse" && ${PUBLISHED_ONLY} && talk->conference._ref == $conferenceId && defined(flaggedAt) && !defined(hiddenAt) && colour in $colours && defined(comment) && comment != ""])`,
    { colours: [...FEEDBACK_COLOURS] },
    { cache: 'no-store' },
  )
  return count ?? 0
}

/** At most this many responses per Remove transaction (§10.3). */
export const REMOVE_CHUNK_SIZE = 100

export type ModerationResult =
  { status: 'refused' } | { status: 'ok'; count: number }

/**
 * THE GUARD, before any write: the ids, deduplicated, with what the guard
 * read of each, if EVERY one passes {@link ownedResponseRows}; otherwise null.
 */
async function ownedResponses(
  conferenceId: string,
  responseIds: readonly string[],
): Promise<Map<string, OwnedRow> | null> {
  const ids = [...new Set(responseIds)]
  if (ids.length === 0) return null
  const found = await ownedResponseRows(conferenceId, ids)
  return ids.every((id) => found.has(id)) ? found : null
}

/**
 * THE AGREEMENT TALLY (Content judgement spec §7.3), added to an action's
 * own transaction: a decision on a comment Jev flagged counts once, at the
 * first decision, for every flagged question in its band. `tally` is whether
 * the organization has judgement on: the advice was shown, so the decision
 * is an agreement or a disagreement with it; off, nothing counts. Returns
 * whether anything was added, so the caller marks the Judgement tallied.
 */
function tallyDecision(
  tx: ReturnType<typeof clientWrite.transaction>,
  tally: boolean,
  row: Pick<OwnedRow, 'judgement' | 'keptAt'>,
  decision: 'agreed' | 'disagreed',
): boolean {
  if (!tally) return false
  // A Keep ended the advice (§8.2), whether or not it was counted (one made
  // while the setting was off is not): no later decision is about it.
  if (row.keptAt) return false
  const flagged = tallyable(row.judgement)
  if (!flagged) return false
  addTally(tx, 'feedbackComment', flagged, decision)
  return true
}

const isNotFound = (error: unknown) => sanityStatus(error) === 404

/** A failed revision guard. */
const isConflict = (error: unknown) => sanityStatus(error) === 409

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

/** How often a Hide whose tally lost its revision guard is planned again. */
const HIDE_REPLANS = 3

/**
 * Hide (§10.3): sets `hiddenAt`, clears `flaggedAt`; the colour still counts.
 * A response whose Judgement the Hide tallies is patched under the revision
 * the guard read found: a Keep or another Hide landing in between (GROQ can
 * lag a write by about a second) fails the commit with 409, and the Hide is
 * planned again from a fresh read, which then sees the mark and counts
 * nothing. An untallied Hide carries no guard, as before.
 */
export async function hideResponses({
  conferenceId,
  responseIds,
  now,
  tally = false,
}: {
  conferenceId: string
  responseIds: readonly string[]
  now: Date
  /** Count agreements (§7.3): the organization has judgement on. */
  tally?: boolean
}): Promise<ModerationResult> {
  const at = now.toISOString()
  for (let replans = 0; ; replans++) {
    const rows = await ownedResponses(conferenceId, responseIds)
    if (!rows) return { status: 'refused' }
    const tx = clientWrite.transaction()
    let guarded = false
    for (const [id, row] of rows) {
      const counted = tallyDecision(tx, tally, row, 'agreed')
      guarded ||= counted
      tx.patch(id, (p) => {
        const patch = counted ? p.ifRevisionId(row.rev) : p
        return patch
          .set({
            hiddenAt: at,
            ...(counted ? { 'judgement.talliedAt': at } : {}),
          })
          .unset(['flaggedAt'])
      })
    }
    try {
      await tx.commit()
    } catch (error) {
      if (isNotFound(error)) return { status: 'refused' }
      if (guarded && isConflict(error) && replans < HIDE_REPLANS) continue
      throw error
    }
    return { status: 'ok', count: rows.size }
  }
}

/**
 * Where a response stands NOW, read through the doc endpoint after a Keep
 * was refused: still flagged (changed: a new flag, new wording, or Jev's
 * advice still open on it), no longer flagged (another organizer kept it,
 * or nothing is left to look at), hidden, or gone (removed, deleted by its
 * device, or its comment emptied).
 */
export type KeepNow = 'flagged' | 'unflagged' | 'hidden' | 'gone'

export type KeepResult =
  | { status: 'refused' }
  | { status: 'kept' }
  /**
   * The response changed since the organizer's page read it. Nothing was
   * written; `now` is where it stands, read past GROQ's lag, so the page can
   * say so truthfully.
   */
  | { status: 'changed'; now: KeepNow }

/** What the organizers' page learns from a Keep (`sessionFeedback.adminKeep`). */
export type KeepAnswer = { kept: true } | { kept: false; now: KeepNow }

/**
 * A response's state through the doc endpoint (no GROQ lag), as
 * {@link KeepNow}. `judgementOn`: Jev's open advice counts as "still
 * flagged" only while the page shows it (§5).
 */
async function keepNow(
  responseId: string,
  judgementOn: boolean,
): Promise<KeepNow> {
  let stored: (ResponseRow & { _type?: string }) | undefined
  try {
    stored = await clientReadUncached.getDocument<
      ResponseRow & { _type?: string }
    >(responseId)
  } catch (error) {
    // Nothing was written; say the cautious thing ("changed, look again")
    // rather than a raw network error.
    console.error('Could not read a refused Keep’s response', error)
    return 'flagged'
  }
  if (
    !stored ||
    stored._id !== responseId ||
    stored._type !== 'feedbackResponse' ||
    !commentOf(stored)
  )
    return 'gone'
  if (stored.hiddenAt) return 'hidden'
  if (stored.flaggedAt) return 'flagged'
  // Another organizer's Keep ended the advice; open advice, by the rule the
  // page collapses a comment under (Content judgement spec §8.2), still
  // needs a look, as a flag does: never "already handled".
  if (stored.keptAt) return 'unflagged'
  return judgementOn && likelyUnsafe(commentJudgement(stored.judgement))
    ? 'flagged'
    : 'unflagged'
}

/**
 * Keep (§10.3): clears `flaggedAt`; the comment stays as it is. GUARDED ON
 * THE REVISION THE ORGANIZER SAW, with no re-read: the comment can be
 * reworded by its attendee after a flag (Submit never touches `flaggedAt`),
 * and a new flag can carry the old one's timestamp, so nothing short of the
 * exact revision says the organizer saw what they are keeping. Any change
 * since (409), or a deletion (404, after the ownership guard passed, so no
 * oracle), is `changed` with where the response stands now. The ownership
 * guard (one scoped read, as Hide's) runs first and is the only refusal.
 */
export async function keepResponse({
  conferenceId,
  responseId,
  seenRev,
  keptBy,
  now,
  tally = false,
}: {
  conferenceId: string
  responseId: string
  seenRev: string
  /** The organizer's speaker id: the Keep mark (Content judgement spec §8.2). */
  keptBy: string
  now: Date
  /** Count a disagreement (§7.3): the organization has judgement on. */
  tally?: boolean
}): Promise<KeepResult> {
  const rows = await ownedResponses(conferenceId, [responseId])
  if (!rows) return { status: 'refused' }
  const at = now.toISOString()
  const tx = clientWrite.transaction()
  const counted = tallyDecision(tx, tally, rows.get(responseId)!, 'disagreed')
  tx.patch(responseId, (p) =>
    p
      .ifRevisionId(seenRev)
      .set({
        keptAt: at,
        keptBy: { _type: 'reference', _ref: keptBy, _weak: true },
        ...(counted ? { 'judgement.talliedAt': at } : {}),
      })
      .unset(['flaggedAt']),
  )
  try {
    await tx.commit()
    return { status: 'kept' }
  } catch (error) {
    const status = sanityStatus(error)
    if (status === 409 || status === 404)
      return { status: 'changed', now: await keepNow(responseId, tally) }
    throw error
  }
}

/** Unhide (§10.3): clears `hiddenAt`. */
export async function unhideResponses({
  conferenceId,
  responseIds,
}: {
  conferenceId: string
  responseIds: readonly string[]
}): Promise<ModerationResult> {
  const rows = await ownedResponses(conferenceId, responseIds)
  if (!rows) return { status: 'refused' }
  const tx = clientWrite.transaction()
  for (const id of rows.keys()) tx.patch(id, (p) => p.unset(['hiddenAt']))
  return commitPatches(tx, rows.size)
}

/**
 * THE ONE GUARD READ every action makes before any write: of the ids, each
 * published response of the conference whose talk is a published talk of
 * the conference, with the revision and time it has now. A missing, draft,
 * release-version or foreign id is left out the same way.
 */
interface OwnedRow {
  rev: string
  submittedAt: unknown
  /** The summary (§7.2) and the Keep mark, for the tally. */
  judgement: unknown
  keptAt: unknown
}

async function ownedResponseRows(
  conferenceId: string,
  ids: readonly string[],
): Promise<Map<string, OwnedRow>> {
  if (ids.length === 0) return new Map()
  const rows = await scopedFetch<
    | {
        _id: string
        _rev: string
        submittedAt?: unknown
        judgement?: unknown
        keptAt?: unknown
      }[]
    | null
  >(
    clientReadUncached,
    { conferenceId },
    `*[_type == "feedbackResponse" && _id in $ids && ${PUBLISHED_ONLY} && talk->conference._ref == $conferenceId && !(talk._ref in path("drafts.**")) && !(talk._ref in path("versions.**"))]{ _id, _rev, submittedAt, judgement, keptAt }`,
    { ids },
    { cache: 'no-store' },
  )
  return new Map(
    (rows ?? []).map((r) => [
      r._id,
      {
        rev: r._rev,
        submittedAt: r.submittedAt,
        judgement: r.judgement,
        keptAt: r.keptAt,
      },
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

/** Ids per doc-endpoint read: they travel in the URL (as in `code.ts`). */
const DOC_READ_CHUNK = 50

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
  tally = false,
}: {
  conferenceId: string
  responses: readonly SeenResponse[]
  /** A range from the chart: start inclusive, end exclusive, ISO instants. */
  range?: { from: string; to: string }
  /** Count agreements (§7.3): the organization has judgement on. */
  tally?: boolean
}): Promise<RemoveResult> {
  const seen = new Map(responses.map((r) => [r.id, r.submittedAt]))
  const inRange = (submittedAt: unknown) => {
    if (!range) return true
    const at = typeof submittedAt === 'string' ? Date.parse(submittedAt) : NaN
    return at >= Date.parse(range.from) && at < Date.parse(range.to)
  }
  const found = await ownedResponseRows(conferenceId, [...seen.keys()])
  const out: RemoveResult = { status: 'ok', removed: 0, gone: 0, changed: 0 }
  const plan: {
    id: string
    rev: string
    judgement: unknown
    keptAt: unknown
  }[] = []
  for (const [id, saw] of seen) {
    const now = found.get(id)
    if (!now) out.gone++
    else if ((now.submittedAt ?? null) !== saw || !inRange(now.submittedAt))
      out.changed++
    else
      plan.push({
        id,
        rev: now.rev,
        judgement: now.judgement,
        keptAt: now.keptAt,
      })
  }

  for (let i = 0; i < plan.length; i += REMOVE_CHUNK_SIZE) {
    let chunk = plan.slice(i, i + REMOVE_CHUNK_SIZE)
    for (let replans = 0; chunk.length > 0; replans++) {
      const tx = clientWrite.transaction()
      for (const entry of chunk) {
        const { id, rev } = entry
        tx.patch(id, (p) =>
          p.ifRevisionId(rev).unset(['_revision_lock_pseudo_field_']),
        )
        // The deleted response cannot be decided on again: no marker needed.
        tallyDecision(tx, tally, entry, 'agreed')
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
      // The ids travel in the URL: at most DOC_READ_CHUNK a request.
      const revOf = new Map<
        string,
        { rev: string; judgement: unknown; keptAt: unknown }
      >()
      try {
        for (let k = 0; k < chunk.length; k += DOC_READ_CHUNK) {
          const docs = await clientWrite.getDocuments<{
            _rev: string
            judgement?: unknown
            keptAt?: unknown
          }>(chunk.slice(k, k + DOC_READ_CHUNK).map((c) => c.id))
          for (const d of docs)
            if (d)
              revOf.set(d._id, {
                rev: d._rev,
                judgement: d.judgement,
                keptAt: d.keptAt,
              })
        }
      } catch (error) {
        // What went before this chunk is still reported; nothing of this
        // chunk was written (its commit lost a guard, which rolls it back).
        console.error('Could not re-read Feedback Responses to remove', error)
        return { ...out, status: 'failed' }
      }
      chunk = chunk.flatMap((entry) => {
        const current = revOf.get(entry.id)
        if (current === undefined) out.gone++
        else if (current.rev !== entry.rev) out.changed++
        return current?.rev === entry.rev
          ? [{ ...entry, judgement: current.judgement, keptAt: current.keptAt }]
          : []
      })
    }
  }
  return out
}
