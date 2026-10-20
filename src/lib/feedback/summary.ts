/**
 * THE SUMMARY (speaker feedback spec §11.1, #1437). Once a session's window
 * has closed, each of its speakers who is not erased gets one bell
 * notification and one email with the session's totals and a link to the
 * results. Counts only, never comment text.
 *
 * - **Who:** published, confirmed talks with no `feedbackSummarySentAt` and
 *   at least one live, published `feedbackResponse`, whose window (§6, from
 *   the official schedule) no longer takes answers. No lookback: the marker
 *   alone makes it one summary per talk, and a day's talks are not lost to a
 *   failed run.
 * - **Claim, then send:** the marker is written first, guarded by the
 *   published talk's revision and on every other version of the talk (§4.2),
 *   so two runs at once claim once. A send that fails is logged and never
 *   retried: one bad address must not make the other speakers hear twice.
 * - Everything a send needs is read BEFORE the claim, so a failed read
 *   costs nothing: the talk stays unclaimed for the next run.
 */
import 'server-only'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import type { Conference } from '@/lib/conference/types'
import { EMAIL_CONFIG, delay } from '@/lib/email/config'
import { sendFeedbackSummaryEmail } from '@/lib/email/feedback-summary'
import { displayName } from '@/lib/events/handlers/ticketTypeNotSetNotification'
import { truncateToGraphemeBoundary } from '@/lib/messaging/links'
import {
  NOTIFICATION_TITLE_MAX,
  createNotificationsOnce,
} from '@/lib/notification/sanity'
import type { OnceNotificationInput } from '@/lib/notification/types'
import { clientReadUncached } from '@/lib/sanity/client'
import { fitsDocumentId } from '@/lib/sanity/helpers'
import { scopedFetch } from '@/lib/sanity/scoped'
import { FEEDBACK_COLOURS, FEEDBACK_COLOUR_LABELS } from './colour'
import { isVisibleComment } from './results'
import {
  PUBLISHED_ONLY,
  getConferenceFeedbackSlots,
  versionsClient,
} from './sanity'
import {
  isRetryable,
  readTalkVersions,
  sweepTalkVersions,
  type TalkDoc,
  type VersionsClient,
} from './talk-versions'
import { talkTotals, type FeedbackTotals, type TalkCounts } from './totals'
import { SESSION_FEEDBACK_ANCHOR } from './url'
import { answersClosed, feedbackWindow } from './window'

/** A talk the summary is due for. */
export interface DueSummary {
  talkId: string
  conferenceId: string
}

/** What the email reads of the talk's conference, as the doc endpoint has it. */
export type SummaryConference = Pick<
  Conference,
  | '_id'
  | 'title'
  | 'organizer'
  | 'cfpEmail'
  | 'contactEmail'
  | 'domains'
  | 'theme'
  | 'organization'
  | 'city'
  | 'country'
  | 'startDate'
  | 'endDate'
  | 'socialLinks'
>

export interface SummaryReport {
  /** Talks the selection query returned, before the window check. */
  candidates: number
  /** Of those, talks whose window no longer takes answers. */
  due: number
  /** Talks this run claimed and sent for. */
  claimed: number
  emailed: number
  emailFailed: number
  /** Not claimed: changed since the selection, claimed by another run, or a version locked in a release. */
  skipped: number
  /** A read or the claim threw; not claimed, so the next run tries again. */
  failed: number
  /** Not started before the deadline; the next run picks them up. */
  notReached: number
}

/** How often a claim that lost a revision guard re-reads and tries again. */
const MAX_RETRIES = 3

// groq-global-scoped: correlated to the talk being tested, and to its own conference, by `^._id` and `^.conference._ref`
const LIVE_RESPONSES = `*[_type == "feedbackResponse" && talk._ref == ^._id && conference._ref == ^.conference._ref && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]`

// groq-global: platform CRON SWEEP. The summary is owed per talk across every tenant; each talk is then handled in its OWN conference's scope (its schedule, its responses, its domain).
const DUE_TALKS = `*[_type == "talk" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && status == "confirmed" && !defined(feedbackSummarySentAt) && count(${LIVE_RESPONSES}) > 0]{ _id, "conferenceId": conference._ref }`

/**
 * The talks whose summary is due at `now` (§11.1). One cross-tenant read
 * for the candidates; then, per conference, its official schedule and the
 * window function, so "closed" means exactly what it means everywhere else.
 */
export async function findDueFeedbackSummaries(
  now: Date,
): Promise<DueSummary[]> {
  return (await selectDue(now)).due.map(({ talkId, conferenceId }) => ({
    talkId,
    conferenceId,
  }))
}

async function selectDue(now: Date): Promise<{
  candidates: number
  due: (DueSummary & { conference: SummaryConference })[]
}> {
  const rows =
    (await clientReadUncached.fetch<
      { _id: string; conferenceId: string | null }[] | null
    >(DUE_TALKS, {}, { cache: 'no-store' })) ?? []
  const byConference = new Map<string, string[]>()
  for (const row of rows) {
    if (!row.conferenceId) continue
    const ids = byConference.get(row.conferenceId) ?? []
    ids.push(row._id)
    byConference.set(row.conferenceId, ids)
  }

  const client = versionsClient()
  const due: (DueSummary & { conference: SummaryConference })[] = []
  for (const [conferenceId, talkIds] of byConference) {
    const conference = await client.getDocument<
      SummaryConference & { _type?: string }
    >(conferenceId)
    if (conference?._type !== 'conference') continue
    const slots = await getConferenceFeedbackSlots(conferenceId)
    for (const talkId of talkIds) {
      const window = feedbackWindow({
        slots: slots.get(talkId) ?? [],
        conferenceEndDate: conference.endDate,
        now,
      })
      if (answersClosed(window)) due.push({ talkId, conferenceId, conference })
    }
  }
  return { candidates: rows.length, due }
}

interface SpeakerDoc {
  _id: string
  _type?: string
  name?: string
  email?: string
  erasedAt?: string
}

type SummaryTalk = TalkDoc & TalkCounts

/** Published, confirmed, of this conference, and not summarized yet. */
const mayClaim = (
  talk: SummaryTalk | null | undefined,
  talkId: string,
  conferenceId: string,
): talk is SummaryTalk =>
  talk?._id === talkId &&
  talk._type === 'talk' &&
  talk.status === 'confirmed' &&
  talk.conference?._ref === conferenceId &&
  !talk.feedbackSummarySentAt

/**
 * Sends the summary of every talk due at `now`, talk by talk, one email at
 * a time. Never throws for one talk: it is logged, and the next goes on. A
 * talk not started by `deadline` is left for the next run, unclaimed.
 */
export async function deliverFeedbackSummaries({
  now,
  deadline,
}: {
  now: Date
  deadline?: Date
}): Promise<SummaryReport> {
  const { candidates, due } = await selectDue(now)
  const report: SummaryReport = {
    candidates,
    due: due.length,
    claimed: 0,
    emailed: 0,
    emailFailed: 0,
    skipped: 0,
    failed: 0,
    notReached: 0,
  }
  const client = versionsClient()
  const pacing = { sends: 0 }
  for (const item of due) {
    if (deadline && Date.now() >= deadline.getTime()) {
      report.notReached++
      continue
    }
    try {
      const outcome = await deliverOne(client, item, now, pacing)
      if (outcome === 'skipped') {
        report.skipped++
        continue
      }
      report.claimed++
      report.emailed += outcome.emailed
      report.emailFailed += outcome.emailFailed
    } catch (error) {
      report.failed++
      console.error(
        '[feedback] summary not sent; the talk stays unclaimed',
        { talkId: item.talkId, conferenceId: item.conferenceId },
        error,
      )
    }
  }
  return report
}

async function deliverOne(
  client: VersionsClient,
  {
    talkId,
    conferenceId,
    conference,
  }: DueSummary & {
    conference: SummaryConference
  },
  now: Date,
  pacing: { sends: number },
): Promise<'skipped' | { emailed: number; emailFailed: number }> {
  // The doc endpoint, not GROQ: the selection may lag a withdrawal or
  // another run's claim by about a second.
  const talk = await client.getDocument<SummaryTalk>(talkId)
  if (!mayClaim(talk, talkId, conferenceId)) return 'skipped'

  const rows =
    (await scopedFetch<
      { colour?: unknown; comment?: unknown; hiddenAt?: unknown }[] | null
    >(
      clientReadUncached,
      { conferenceId },
      `*[_type == "feedbackResponse" && talk._ref == $talkId && ${PUBLISHED_ONLY}]{ colour, comment, hiddenAt }`,
      { talkId },
      { cache: 'no-store' },
    )) ?? []
  // Every answer removed since the selection: nothing to tell.
  if (rows.length === 0) return 'skipped'

  const speakerIds = [
    ...new Set(
      (talk.speakers ?? [])
        .map((s) => s._ref)
        .filter((id): id is string => typeof id === 'string'),
    ),
  ]
  const found: (SpeakerDoc | null)[] =
    speakerIds.length > 0
      ? await client.getDocuments<SpeakerDoc>(speakerIds)
      : []
  // Erased speakers hear nothing (§11.1).
  const speakers = found.filter(
    (s): s is SpeakerDoc => !!s && s._type === 'speaker' && !s.erasedAt,
  )

  const totals = talkTotals(talk, rows)
  const comments = rows.filter(isVisibleComment).length

  if (!(await claim(client, talkId, conferenceId, now))) return 'skipped'
  await sweepTalkVersions(client, talkId, 'feedbackSummarySentAt')

  // One line, no invisible or bidi characters, quotes that cannot close ours.
  const title = displayName(talk.title ?? '') || 'your session'
  const path = `/cfp/proposal/${talkId}#${SESSION_FEEDBACK_ANCHOR}`
  await createNotificationsOnce(
    summaryNotifications({
      talkId,
      conferenceId,
      title,
      totals,
      comments,
      link: path,
      speakerIds: speakers.map((s) => s._id),
    }),
    { talkId, conferenceId, summary: true },
  )

  let emailed = 0
  let emailFailed = 0
  const resultsUrl = `${conferenceBaseUrl(conference)}${path}`
  for (const speaker of speakers) {
    if (!speaker.email) continue
    // Resend allows about two requests a second, across the whole run.
    if (pacing.sends > 0) await delay(EMAIL_CONFIG.RATE_LIMIT_DELAY)
    pacing.sends++
    try {
      await sendFeedbackSummaryEmail({
        to: speaker.email,
        speakerName: speaker.name ?? '',
        talkTitle: title,
        totals,
        comments,
        resultsUrl,
        conference,
      })
      emailed++
    } catch (error) {
      emailFailed++
      console.error(
        '[feedback] summary email not sent (claimed, so not retried)',
        { talkId, speakerId: speaker._id },
        error,
      )
    }
  }
  return { emailed, emailFailed }
}

/**
 * Write `feedbackSummarySentAt` on the published talk, guarded by its
 * revision, and on the draft and every active release version, each guarded
 * by its own, in one transaction (§4.2). `false` when this run must not
 * send: another run claimed it first, the talk stopped qualifying, or a
 * version waits in a release that is not `active` (Sanity locks it, so
 * publishing it would bring a second summary; the talk is tried again on
 * the next run). Throws on anything else; nothing was claimed.
 */
async function claim(
  client: VersionsClient,
  talkId: string,
  conferenceId: string,
  now: Date,
): Promise<boolean> {
  const sentAt = now.toISOString()
  for (let attempt = 0; ; attempt++) {
    const { published, versions, locked, releasesListed } =
      await readTalkVersions(client, talkId)
    if (!mayClaim(published, talkId, conferenceId)) return false
    if (!releasesListed || locked.length > 0) {
      console.error(
        `[feedback] summary of ${talkId} waits: ${
          releasesListed
            ? 'a version is in a release that is not active'
            : 'could not list releases'
        }`,
      )
      return false
    }
    const tx = client
      .transaction()
      .patch(published._id, (p) =>
        p.ifRevisionId(published._rev).set({ feedbackSummarySentAt: sentAt }),
      )
    for (const v of versions) {
      tx.patch(v._id, (p) =>
        p.ifRevisionId(v._rev).set({ feedbackSummarySentAt: sentAt }),
      )
    }
    try {
      await tx.commit()
      return true
    } catch (error) {
      if (!isRetryable(error) || attempt >= MAX_RETRIES) throw error
    }
  }
}

const ID_PREFIX = 'notification.feedback-summary.'

/**
 * `notification.feedback-summary.<talkId>.<speakerId>`: once per talk and
 * speaker, ever, with THE SPEAKER LAST for the speaker merge
 * (`DETERMINISTIC_ID_PREFIXES` in `@/lib/speaker/merge`).
 */
export const summaryNotificationId = (talkId: string, speakerId: string) =>
  `${ID_PREFIX}${talkId}.${speakerId}`

/** "Loved it 5 · It was OK 1 · Not for me 2. 8 responses, 1 comment." */
export function summaryLine(totals: FeedbackTotals, comments: number): string {
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`
  const colours = FEEDBACK_COLOURS.map(
    (c) => `${FEEDBACK_COLOUR_LABELS[c]} ${totals.combined[c]}`,
  ).join(' · ')
  return `${colours}. ${plural(totals.total, 'response', 'responses')}, ${plural(comments, 'comment', 'comments')}.`
}

/** One bell notification per speaker: the title and the counts, nothing else. */
export function summaryNotifications({
  talkId,
  conferenceId,
  title,
  totals,
  comments,
  link,
  speakerIds,
}: {
  talkId: string
  conferenceId: string
  title: string
  totals: FeedbackTotals
  comments: number
  link: string
  speakerIds: readonly string[]
}): OnceNotificationInput[] {
  const start = 'Your Session Feedback for “'
  const room = NOTIFICATION_TITLE_MAX - start.length - 1
  const name =
    title.length > room
      ? `${truncateToGraphemeBoundary(title, room - 1)}…`
      : title
  return speakerIds
    .map((speakerId) => ({
      speakerId,
      id: summaryNotificationId(talkId, speakerId),
    }))
    .filter(({ id }) => fitsDocumentId(id))
    .map(({ speakerId, id }) => ({
      id,
      recipientId: speakerId,
      conferenceId,
      notificationType: 'session_feedback_summary' as const,
      title: `${start}${name}”`,
      message: summaryLine(totals, comments),
      link,
      relatedProposalId: talkId,
    }))
}
