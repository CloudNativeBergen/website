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
import { randomUUID } from 'node:crypto'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import type { Conference } from '@/lib/conference/types'
import { EMAIL_CONFIG, delay } from '@/lib/email/config'
import {
  FEEDBACK_SUMMARY_EMAIL_WORST_CASE_MS,
  isOutcomeUnknown,
  isRecipientRefusal,
  resolveFeedbackSummarySender,
  sendFeedbackSummaryEmail,
  type FeedbackSummarySender,
} from '@/lib/email/feedback-summary'
import {
  NOTIFICATION_TITLE_MAX,
  createNotificationsOnce,
} from '@/lib/notification/sanity'
import type { OnceNotificationInput } from '@/lib/notification/types'
import { clientReadUncached } from '@/lib/sanity/client'
import { fitsDocumentId } from '@/lib/sanity/helpers'
import { scopedFetch } from '@/lib/sanity/scoped'
import { displayName, plural } from '@/lib/text/display'
import { FEEDBACK_COLOURS, FEEDBACK_COLOUR_LABELS } from './colour'
import { isVisibleComment } from './results'
import {
  PUBLISHED_ONLY,
  getConferenceFeedbackSlots,
  getFeedbackSlots,
  versionsClient,
} from './sanity'
import {
  MAX_RETRIES,
  isRetryable,
  readTalkVersions,
  requestCap,
  sweepTalkVersions,
  type TalkDoc,
  type VersionsClient,
} from './talk-versions'
import { summaryTitle } from './summary-copy'
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
  /** Not sent: refused, failed, or no time left before the deadline. */
  emailFailed: number
  /**
   * Emails whose outcome is unknown: Resend was still processing an earlier
   * attempt under the same key when the retries ran out (likely sent).
   */
  emailUnknown: number
  /** Not claimed: changed since the selection, claimed by another run, or a version locked in a release. */
  skipped: number
  /**
   * A read or the claim threw, for the talk or for its conference's
   * selection; not claimed, so the next run tries again.
   */
  failed: number
  /** Not started before the deadline; the next run picks them up. */
  notReached: number
  /**
   * Not claimed because their sender failed every email of an earlier talk
   * this run, for a reason that was not the address; the next run sends them.
   */
  senderDown: number
}

// groq-global-scoped: correlated to the talk being tested, and to its own conference, by `^._id` and `^.conference._ref`
const LIVE_RESPONSES = `*[_type == "feedbackResponse" && talk._ref == ^._id && conference._ref == ^.conference._ref && !(_id in path("drafts.**")) && !(_id in path("versions.**"))]`

// groq-global: platform CRON SWEEP. The summary is owed per talk across every tenant; each talk is then handled in its OWN conference's scope (its schedule, its responses, its domain).
export const DUE_TALKS = `*[_type == "talk" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && status == "confirmed" && !defined(feedbackSummarySentAt) && count(${LIVE_RESPONSES}) > 0]{ _id, "conferenceId": conference._ref }`

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
  /** Candidates of a conference whose reads failed: not tried this run. */
  unread: number
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
  let unread = 0
  for (const [conferenceId, talkIds] of byConference) {
    // One conference's failed read holds back only its own talks: nothing
    // of them is claimed, so the next run selects them again.
    let read: {
      conference: SummaryConference
      slots: Awaited<ReturnType<typeof getConferenceFeedbackSlots>>
    } | null
    try {
      const conference = await client.getDocument<
        SummaryConference & { _type?: string }
      >(conferenceId)
      read =
        conference?._type === 'conference'
          ? {
              conference,
              slots: await getConferenceFeedbackSlots(conferenceId),
            }
          : null
    } catch (error) {
      console.error(
        '[feedback] summary selection skipped a conference whose reads failed; its talks wait for the next run',
        { conferenceId, talks: talkIds.length },
        error,
      )
      unread += talkIds.length
      continue
    }
    if (!read) continue
    const { conference, slots } = read
    for (const talkId of talkIds) {
      const window = feedbackWindow({
        slots: slots.get(talkId) ?? [],
        conferenceEndDate: conference.endDate,
        now,
      })
      if (answersClosed(window)) due.push({ talkId, conferenceId, conference })
    }
  }
  return { candidates: rows.length, due, unread }
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
 * talk whose emails would not all end by `deadline` at their worst is left
 * for the next run, unclaimed (checked right before each claim).
 */
export async function deliverFeedbackSummaries({
  now,
  deadline,
}: {
  now: Date
  deadline?: Date
}): Promise<SummaryReport> {
  const { candidates, due, unread } = await selectDue(now)
  const report: SummaryReport = {
    candidates,
    due: due.length,
    claimed: 0,
    emailed: 0,
    emailFailed: 0,
    emailUnknown: 0,
    skipped: 0,
    failed: unread,
    notReached: 0,
    senderDown: 0,
  }
  const client = versionsClient()
  // The claim's reads and commit, each bounded, so the reserve they are
  // budgeted in holds (the client's default is five minutes).
  const claimClient = versionsClient({ timeout: CLAIM_REQUEST_TIMEOUT_MS })
  const pacing = { sends: 0 }
  // One sender per conference, resolved once per run and BEFORE any of its
  // talks is claimed: a sender that cannot be resolved leaves them unclaimed.
  const senders = new Map<string, Promise<FeedbackSummarySender>>()
  const senderFor = (conference: SummaryConference) => {
    let sender = senders.get(conference._id)
    if (!sender) {
      sender = resolveFeedbackSummarySender(conference)
      senders.set(conference._id, sender)
    }
    return sender
  }
  // Senders that failed every email of a talk for a reason that was not the
  // address (an outage past the retries, a revoked key, an unverified
  // domain, a quota): their remaining talks stay unclaimed for the next run
  // rather than being claimed and failing too.
  const down = new Set<string>()
  for (const item of due) {
    // Past the deadline nothing more is read: a backlog must not run the
    // function past its budget and lose this report.
    if (deadline && Date.now() >= deadline.getTime()) {
      report.notReached++
      continue
    }
    try {
      const sender = await senderFor(item.conference)
      if (down.has(sender.key)) {
        report.senderDown++
        continue
      }
      const outcome = await deliverOne(client, claimClient, item, {
        now,
        deadline,
        pacing,
        sender,
      })
      if (outcome === 'skipped') {
        report.skipped++
        continue
      }
      if (outcome === 'notReached') {
        report.notReached++
        continue
      }
      report.claimed++
      report.emailed += outcome.emailed
      report.emailFailed += outcome.emailFailed
      report.emailUnknown += outcome.emailUnknown
      // No email of the talk went out, and at least one failed for the
      // sender's reason (a refused co-speaker address does not hide that) or
      // was left in progress at Resend (a stalled Resend). The cost is a
      // day's delay for the sender's other talks, not their loss.
      if (
        outcome.emailed === 0 &&
        (outcome.senderFailed > 0 || outcome.emailUnknown > 0)
      ) {
        down.add(sender.key)
        console.error(
          '[feedback] summary run stops sending through a sender that failed every email of a talk; its other talks stay unclaimed until the next run',
          {
            orgId: item.conference.organization?._ref ?? null,
            conferenceId: item.conferenceId,
            talkId: item.talkId,
          },
        )
      }
    } catch (error) {
      report.failed++
      console.error(
        '[feedback] summary not sent for this talk',
        { talkId: item.talkId, conferenceId: item.conferenceId },
        error,
      )
    }
  }
  return report
}

async function deliverOne(
  client: VersionsClient,
  claimClient: VersionsClient,
  {
    talkId,
    conferenceId,
    conference,
  }: DueSummary & {
    conference: SummaryConference
  },
  {
    now,
    deadline,
    pacing,
    sender,
  }: {
    now: Date
    deadline: Date | undefined
    pacing: { sends: number }
    sender: FeedbackSummarySender
  },
): Promise<
  | 'skipped'
  | 'notReached'
  | {
      emailed: number
      emailFailed: number
      /** Of the failed, those Resend did not refuse for the address. */
      senderFailed: number
      emailUnknown: number
    }
> {
  // Read, then claim THAT revision of the talk: what is sent (its speakers,
  // its counts) must be what was claimed. When the talk changed in between,
  // read it again.
  let prepared: Prepared | null = null
  for (let attempt = 0; ; attempt++) {
    prepared = await prepare(client, talkId, conference, now)
    if (!prepared) return 'skipped'
    // Right before the claim: once claimed, a run killed before the sends
    // loses them for good. Unclaimed, the talk waits for the next run.
    const recipients = prepared.recipientIds.length
    const fits = () => !deadline || fitsBefore(deadline, recipients)
    const outcome = fits()
      ? await claimSummary(claimClient, prepared.talk, conferenceId, now, fits)
      : 'late'
    if (outcome === 'late') {
      console.error(
        '[feedback] summary does not fit before the deadline; the talk stays unclaimed for the next run',
        { talkId, recipients },
      )
      return 'notReached'
    }
    if (outcome === 'claimed') break
    if (outcome === 'refused') return 'skipped'
    if (attempt >= MAX_RETRIES) {
      throw new Error(`the talk kept changing during ${MAX_RETRIES + 1} claims`)
    }
  }
  console.log(`[feedback] claimed ${talkId} for its summary`)
  const { talk, totals, comments, speakerIds, recipientIds } = prepared

  // Before the emails, so a run that dies during them still leaves no
  // stale draft to publish the marker away (and bring a second summary);
  // bounded, so it cannot take their time. On a timeout it goes on alone.
  await bounded(
    sweepTalkVersions(claimClient, talkId, 'feedbackSummarySentAt', {
      requestTimeoutMs: CLAIM_REQUEST_TIMEOUT_MS,
    }),
    SWEEP_TIMEOUT_MS,
    () =>
      console.error(
        '[feedback] summary sweep of the talk versions still pending; sending anyway',
        { talkId, conferenceId },
      ),
  )

  // Read again AFTER the claim: a speaker erased since the talk was read
  // must hear nothing (§11.1), and erasure does not touch the talk, so the
  // claim's revision guard cannot see it. A failed read sends nothing: a
  // missed summary is better than mail to someone who asked to be erased.
  let speakers: SpeakerDoc[]
  try {
    speakers = await speakersAfterClaim(client, talkId, speakerIds)
  } catch (error) {
    console.error(
      '[feedback] summary not sent: its speakers could not be read after the claim',
      { talkId, conferenceId },
      error,
    )
    return { emailed: 0, emailFailed: 0, senderFailed: 0, emailUnknown: 0 }
  }

  // One line, no invisible or bidi characters, quotes that cannot close ours.
  const title = displayName(talk.title ?? '') || 'your session'
  const path = `/cfp/proposal/${talkId}#${SESSION_FEEDBACK_ANCHOR}`

  // The bell alongside the emails, never ahead of them, and waited for at
  // most BELL_TIMEOUT_MS: it never fails the run, and a hung write must not
  // take the emails' time.
  const bell = bounded(
    createNotificationsOnce(
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
    ),
    BELL_TIMEOUT_MS,
    () =>
      console.error(
        '[feedback] summary bell write still pending; going on without it',
        { talkId, conferenceId },
      ),
  )

  // Side by side, each started a pause after the run's previous one (Resend
  // allows about two requests a second): a talk's emails then take about
  // one email's worst case, whatever its number of speakers.
  const resultsUrl = `${conferenceBaseUrl(conference)}${path}`
  const sends: Promise<'sent' | 'unknown' | 'recipient' | 'sender' | 'late'>[] =
    []
  // Each email starts only if its worst case, after its pause, still ends
  // before the deadline. The fit check budgeted the recipients read before
  // the claim, so they go first; one the talk gained since (a speaker
  // merged, added, or who gave an address) takes only the time left.
  const budgeted = new Set(recipientIds)
  const ordered = [
    ...speakers.filter((s) => budgeted.has(s._id)),
    ...speakers.filter((s) => !budgeted.has(s._id)),
  ]
  for (const speaker of ordered) {
    const to = speaker.email
    if (!to) continue
    const pause = pacing.sends > 0 ? EMAIL_CONFIG.RATE_LIMIT_DELAY : 0
    // Time only runs out: once one does not fit, none after it does, and
    // none waits for its pause.
    if (
      deadline &&
      deadline.getTime() - Date.now() - pause <
        FEEDBACK_SUMMARY_EMAIL_WORST_CASE_MS
    ) {
      console.error(
        '[feedback] summary email not sent: no time left before the deadline (claimed, so not retried)',
        { talkId, speakerId: speaker._id },
      )
      sends.push(Promise.resolve('late' as const))
      continue
    }
    if (pause > 0) await delay(pause)
    pacing.sends++
    sends.push(
      sendFeedbackSummaryEmail({
        talkId,
        speakerId: speaker._id,
        to,
        speakerName: speaker.name ?? '',
        talkTitle: title,
        totals,
        comments,
        resultsUrl,
        conference,
        sender,
      }).then(
        () => 'sent' as const,
        (error: unknown) => {
          if (isOutcomeUnknown(error)) {
            // An earlier attempt is still in progress at Resend under this
            // key: likely sent.
            console.error(
              '[feedback] summary email outcome unknown (Resend still processing it; likely sent)',
              { talkId, speakerId: speaker._id },
              error,
            )
            return 'unknown' as const
          }
          console.error(
            '[feedback] summary email not sent (claimed, so not retried)',
            { talkId, speakerId: speaker._id },
            error,
          )
          return isRecipientRefusal(error)
            ? ('recipient' as const)
            : ('sender' as const)
        },
      ),
    )
  }
  const results = await Promise.all(sends)
  await bell

  const count = (r: (typeof results)[number]) =>
    results.filter((x) => x === r).length
  return {
    emailed: count('sent'),
    emailFailed: count('recipient') + count('sender') + count('late'),
    senderFailed: count('sender'),
    emailUnknown: count('unknown'),
  }
}

/** How long the run waits for the bell write before going on. */
const BELL_TIMEOUT_MS = 10_000
/** The speaker reads of one step through the doc endpoint, all of them. */
const SPEAKER_READ_TIMEOUT_MS = 10_000
/** How long the run waits for the version sweep before sending anyway. */
const SWEEP_TIMEOUT_MS = 10_000
/** Each Sanity request of the claim: the version reads, the commit, the read-backs. */
const CLAIM_REQUEST_TIMEOUT_MS = 5_000
/** Before the second read-back of a claim whose commit failed. */
const CLAIM_LANDING_GRACE_MS = 2_000

/** `work`, or after `ms` whatever it has not done, with `onTimeout` told. */
function bounded(
  work: Promise<unknown>,
  ms: number,
  onTimeout: () => void,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    work.then(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        onTimeout()
        resolve()
      }, ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

/**
 * After the fit check and before the first email, each step bounded: the
 * claim's version reads (two rounds), its commit and up to two read-backs
 * of a failed one ({@link CLAIM_REQUEST_TIMEOUT_MS} each, with
 * {@link CLAIM_LANDING_GRACE_MS} between them), the sweep
 * ({@link SWEEP_TIMEOUT_MS}) and the speaker reads
 * ({@link SPEAKER_READ_TIMEOUT_MS} for all of them), and a margin. The bell runs alongside
 * the emails, so it takes none of this.
 */
const CLAIM_OVERHEAD_MS =
  5 * CLAIM_REQUEST_TIMEOUT_MS +
  CLAIM_LANDING_GRACE_MS +
  SWEEP_TIMEOUT_MS +
  SPEAKER_READ_TIMEOUT_MS +
  5_000

/**
 * A talk's every email, at its worst, ends before `deadline`: started a
 * pause apart, the last one starts after `recipients - 1` pauses and takes
 * at most one email's worst case. That worst case is counted even with no
 * recipient: a speaker merged after the claim may bring one (see
 * {@link speakersAfterClaim}). A recipient beyond the budget is sent only
 * if its own worst case still fits (checked as each email starts).
 */
function fitsBefore(deadline: Date, recipients: number): boolean {
  const worst =
    CLAIM_OVERHEAD_MS +
    recipients * EMAIL_CONFIG.RATE_LIMIT_DELAY +
    FEEDBACK_SUMMARY_EMAIL_WORST_CASE_MS
  return deadline.getTime() - Date.now() >= worst
}

interface Prepared {
  talk: SummaryTalk
  totals: FeedbackTotals
  comments: number
  speakerIds: string[]
  /** Speakers who are not erased and have an address: the emails to fit. */
  recipientIds: string[]
}

/** The talk's speaker ids, each once. */
const speakerRefs = (talk: TalkDoc): string[] => [
  ...new Set(
    (talk.speakers ?? [])
      .map((s) => s._ref)
      .filter((id): id is string => typeof id === 'string'),
  ),
]

/** Each id's speaker as the doc endpoint has it now: `null` when it is gone. */
async function readSpeakers(
  client: VersionsClient,
  ids: string[],
  signal: AbortSignal,
): Promise<(SpeakerDoc | null)[]> {
  if (ids.length === 0) return []
  return client.getDocuments<SpeakerDoc>(ids, { signal })
}

const live = (found: (SpeakerDoc | null)[]): SpeakerDoc[] =>
  found.filter(
    (s): s is SpeakerDoc => !!s && s._type === 'speaker' && !s.erasedAt,
  )

/** The speakers who exist and are not erased, as the doc endpoint has them now. */
async function liveSpeakers(
  client: VersionsClient,
  ids: string[],
): Promise<SpeakerDoc[]> {
  // Bounded: a hung read must not hold the run past its time budget.
  const signal = AbortSignal.timeout(SPEAKER_READ_TIMEOUT_MS)
  return live(await readSpeakers(client, ids, signal))
}

/**
 * The claimed talk's speakers, read after the claim. A speaker merged into
 * another since (`mergeSpeakers` repoints the talk to the one kept and
 * deletes the duplicate, in one transaction) is gone by then: the talk is
 * read again, for the speakers it names now, and again while each read
 * finds one gone that the talk no longer names. All of it within one
 * {@link SPEAKER_READ_TIMEOUT_MS}.
 */
async function speakersAfterClaim(
  client: VersionsClient,
  talkId: string,
  claimedIds: string[],
): Promise<SpeakerDoc[]> {
  const signal = AbortSignal.timeout(SPEAKER_READ_TIMEOUT_MS)
  let ids = claimedIds
  for (let attempt = 0; ; attempt++) {
    const found = await readSpeakers(client, ids, signal)
    if (found.every((s) => s !== null)) return live(found)
    if (attempt >= MAX_RETRIES) {
      console.error(
        '[feedback] summary speakers kept being merged; sending to those found',
        { talkId },
      )
      return live(found)
    }
    const talk = await client.getDocument<SummaryTalk>(talkId, { signal })
    const named = talk ? speakerRefs(talk) : ids
    // Gone, and still named (deleted, not merged): nobody else to tell.
    const read = new Set(ids)
    if (named.length === read.size && named.every((id) => read.has(id)))
      return live(found)
    ids = named
  }
}

/**
 * Everything the summary sends, read before anything is claimed: a read
 * that fails then costs nothing. `null` when the talk no longer qualifies.
 */
async function prepare(
  client: VersionsClient,
  talkId: string,
  conference: SummaryConference,
  now: Date,
): Promise<Prepared | null> {
  const conferenceId = conference._id
  // The doc endpoint, not GROQ: the selection may lag a withdrawal or
  // another run's claim by about a second.
  const talk = await client.getDocument<SummaryTalk>(talkId)
  if (!mayClaim(talk, talkId, conferenceId)) return null

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
  if (rows.length === 0) return null

  const speakerIds = speakerRefs(talk)
  // The window again, from this talk's own slots as they are now: the
  // schedule is another document, so the claim's guard cannot see a move.
  const window = feedbackWindow({
    slots: await getFeedbackSlots(conferenceId, talkId),
    conferenceEndDate: conference.endDate,
    now,
  })
  if (!answersClosed(window)) return null

  return {
    talk,
    totals: talkTotals(talk, rows),
    comments: rows.filter(isVisibleComment).length,
    speakerIds,
    recipientIds: (await liveSpeakers(client, speakerIds))
      .filter((s) => s.email)
      .map((s) => s._id),
  }
}

/**
 * Write `feedbackSummarySentAt` on the published talk, guarded by the
 * revision {@link prepare} read, and on the draft and every active release
 * version, each guarded by its own, in one transaction (§4.2).
 *
 * - `claimed`: this run sends.
 * - `stale`: the talk changed since it was read (another edit, or a version
 *   edited during the commit); read it again and retry.
 * - `refused`: this run must not send: another run claimed it, it stopped
 *   qualifying, or a version waits in a release that is not `active` (Sanity
 *   locks it, so publishing it would bring a second summary; the talk is
 *   tried again on the next run).
 *
 * Throws on anything else; nothing was claimed.
 */
export async function claimSummary(
  client: VersionsClient,
  talk: SummaryTalk,
  conferenceId: string,
  now: Date,
  /** The talk's emails still fit the run, checked again before the commit. */
  fits: () => boolean,
  /** Each request of the claim ends after this long (see `requestCap`). */
  requestTimeoutMs: number = CLAIM_REQUEST_TIMEOUT_MS,
): Promise<'claimed' | 'stale' | 'refused' | 'late'> {
  const { published, versions, locked, releasesListed } =
    await readTalkVersions(client, talk._id, { requestTimeoutMs })
  if (!mayClaim(published, talk._id, conferenceId)) return 'refused'
  if (!releasesListed || locked.length > 0) {
    console.error(
      `[feedback] summary of ${talk._id} waits: ${
        releasesListed
          ? 'a version is in a release that is not active'
          : 'could not list releases'
      }`,
    )
    return 'refused'
  }
  // The version reads took time: once committed, a run killed before the
  // sends loses them, so the commit waits for nothing that no longer fits.
  if (!fits()) return 'late'
  const sentAt = now.toISOString()
  // Our own transaction id: Sanity stores it as the talk's `_rev`, so a
  // claim whose reply was lost can be recognized as ours.
  const transactionId = randomUUID()
  const tx = client
    .transaction()
    .transactionId(transactionId)
    .patch(talk._id, (p) =>
      p.ifRevisionId(talk._rev).set({ feedbackSummarySentAt: sentAt }),
    )
  for (const v of versions) {
    tx.patch(v._id, (p) =>
      p.ifRevisionId(v._rev).set({ feedbackSummarySentAt: sentAt }),
    )
  }
  try {
    await tx.commit(requestCap(requestTimeoutMs))
    return 'claimed'
  } catch (error) {
    if (isRetryable(error)) return 'stale'
    // The commit may have landed and only its reply been lost (a reset
    // socket, a 502 after the write): `@sanity/client` never retries a
    // mutation. Treated as unclaimed, the talk would be marked sent and
    // never told; so read it back.
    // A client-side timeout does not cancel the mutation at Sanity, so an
    // in-flight commit gets a moment and a second look.
    for (const wait of [0, CLAIM_LANDING_GRACE_MS]) {
      if (wait > 0) await delay(wait)
      if (
        await claimLanded(client, talk._id, transactionId, requestTimeoutMs)
      ) {
        console.error(
          `[feedback] the claim of ${talk._id} landed although its reply failed; sending`,
          error,
        )
        return 'claimed'
      }
    }
    console.error(
      '[feedback] summary claim failed with an unknown outcome: it may still land, and then this talk is never told',
      { talkId: talk._id, transactionId },
      error,
    )
    throw error
  }
}

/**
 * The talk carries this claim: our transaction id is its revision (Sanity
 * sets `_rev` to the id of the transaction that last wrote the document).
 * Not the stored time: another run started in the same millisecond writes
 * the same one. False when a later write has moved the revision on, or the
 * talk cannot be read: then nothing is sent and the error is reported.
 */
async function claimLanded(
  client: VersionsClient,
  talkId: string,
  transactionId: string,
  requestTimeoutMs: number,
): Promise<boolean> {
  try {
    const talk = await client.getDocument<SummaryTalk>(
      talkId,
      requestCap(requestTimeoutMs),
    )
    return talk?._rev === transactionId
  } catch {
    return false
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
      title: summaryTitle(title, NOTIFICATION_TITLE_MAX),
      message: summaryLine(totals, comments),
      link,
      relatedProposalId: talkId,
    }))
}
