/**
 * OUTCOME COMPUTATION (docs/MARKETING_PLAN_SPEC.md §6.3) — pure, and the only
 * place that decides what a Campaign's number means. The snapshot engine
 * fetches; this module counts. Nothing here touches the network, Sanity or the
 * clock beyond the `now` it is handed.
 *
 * TWO WINDOWS, because two different questions are being asked:
 *
 *  - the ATTRIBUTED window runs from the Campaign's first PUBLISHED Task to its
 *    end plus {@link ATTRIBUTION_TAIL_DAYS}, and bounds everything a tagged link
 *    can be credited with. It cannot start before a post exists, and the tail is
 *    there because a post keeps working after the Campaign's last day.
 *  - the STRICT window is the Campaign's own dates, and bounds the two Outcomes
 *    that are NOT attributed to our links at all — CFP submissions and ticket
 *    sales, which are counted because they happened while the Campaign ran.
 *
 * ONE CALENDAR, the CONFERENCE's. A Campaign's `startDate`/`endDate` are days
 * in the conference timezone, so every other day here is too: the breakdown's
 * rows are grouped in that zone by the query, and an instant (a publication, a
 * proposal, a ticket order) becomes a day through {@link conferenceDay}.
 * Mixing in UTC days would put the first and last hour of every edge day in
 * the wrong Campaign.
 *
 * NULL IS NOT ZERO. A source that could not be read, a window that has not
 * opened, a counter the vendor omitted: all `null`. Zero is a reading that the
 * thing did not happen, and the ledger says the two differently (spec §2.4).
 */

import { osloTodayDateString } from '@/lib/time'
import type { CampaignBreakdownRow } from './analytics'
import { addDaysToDate } from './materialize'
import { totalEngagement, type PostEngagement } from '@/lib/social/provider'
import type { VariantStatus } from '@/lib/social/types'
import type { MarketingChannel, Outcome, TaskKind } from './types'

/** How long a published post keeps earning credit past the Campaign's end. */
export const ATTRIBUTION_TAIL_DAYS = 7

/** A half-open range of UTC calendar days: `from <= day < to`. */
export interface OutcomeWindow {
  /** YYYY-MM-DD, inclusive. */
  from: string
  /** YYYY-MM-DD, EXCLUSIVE. */
  to: string
}

export interface OutcomeCampaign {
  /** The Campaign key, which is the `utm_campaign` its links carry. */
  key: string
  primaryOutcome: Outcome
  /** YYYY-MM-DD, materialized from the Milestones (spec §2.2). */
  startDate: string
  endDate: string
}

/** What the computation needs to know about one Task of the Campaign. */
export interface OutcomeTask {
  _id: string
  /** The Task key, which is the `utm_content` its links carry. */
  key: string
  kind: TaskKind
  channel: MarketingChannel | null
  /** The variant's status; null when the Task is not a publishing Task. */
  variantStatus: VariantStatus | null
  /**
   * When the post actually went out (the `attempts[]` entry that succeeded),
   * ISO. Null while unpublished — a SCHEDULED time is not a publication.
   */
  publishedAt: string | null
  /** The Bluesky `at://` uri from `publishResult.externalId`, when we have one. */
  postUri: string | null
}

export interface OutcomeProposal {
  /** ISO datetime the proposal document was created. */
  createdAt: string
  /** `utm.campaign` persisted at submission, or null for an untagged arrival. */
  utmCampaign: string | null
}

export interface OutcomeTicket {
  /** ISO datetime of the order. */
  orderDate: string
}

export interface OutcomeInput {
  campaign: OutcomeCampaign
  tasks: readonly OutcomeTask[]
  /**
   * DAY-GRAIN breakdown rows for the whole plan range (spec §6.4 allows one
   * call per conference). `null` means PostHog could not be read at all — every
   * number it feeds is then `null`, not 0. Rows without a `date` are ignored:
   * an undated total cannot be placed in a window.
   */
  rows: readonly CampaignBreakdownRow[] | null
  /** Engagement by post uri; `null` when Bluesky could not be read. */
  engagement: ReadonlyMap<string, PostEngagement> | null
  /** All of the edition's proposals; `null` when they could not be read. */
  proposals: readonly OutcomeProposal[] | null
  /** All of the edition's tickets; `null` when they could not be read. */
  tickets: readonly OutcomeTicket[] | null
  /** The instant the reading is taken; nothing on or after its day counts. */
  now: Date
}

export interface PerTaskOutcome {
  taskId: string
  taskKey: string
  sessions: number | null
  clicks: number | null
  engagement: PostEngagement | null
}

export interface OutcomeResult {
  /** The Campaign's primary Outcome, or null when it cannot be known yet. */
  value: number | null
  /**
   * Whether the primary value is ATTRIBUTED to this Campaign's links. False for
   * `ticketsSoldInWindow`, which is "in window, not attributed" (spec §6.3) —
   * the ledger must never present it as something the Campaign caused.
   */
  attributed: boolean
  /**
   * The attributed SUBSET of the primary value, when the Outcome has one:
   * `cfpSubmissions` counts every proposal in the window and this counts the
   * ones whose stored `utm.campaign` is this Campaign's key. Null otherwise.
   */
  attributedValue: number | null
  secondary: {
    attributedSessions: number | null
    checkoutClickThrough: number | null
    blueskyInteractions: number | null
  }
  perTask: PerTaskOutcome[]
  /** The window the attributed numbers were taken over; null when none is open. */
  attributedWindow: OutcomeWindow | null
  /** The Campaign's own dates, clamped to completed days; null when not started. */
  strictWindow: OutcomeWindow | null
}

/**
 * The CONFERENCE-timezone calendar day an instant falls on, as YYYY-MM-DD, or
 * null for an unparseable one. The same rule the rest of the platform dates
 * things by (`osloTodayDateString`), so a Task due "on the 10th" and a click
 * "on the 10th" mean the same 24 hours.
 */
export function conferenceDay(at: Date | string): string | null {
  const date = typeof at === 'string' ? new Date(at) : at
  return Number.isNaN(date.getTime()) ? null : osloTodayDateString(date)
}

/**
 * The Campaign's own dates as a half-open day range, clamped so the CURRENT
 * day never counts (spec §6.2 "never query up to now"): a part-day reading
 * would change under its own feet. Null when nothing of the window is complete.
 */
export function strictWindow(
  campaign: OutcomeCampaign,
  now: Date,
): OutcomeWindow | null {
  if (!campaign.startDate || !campaign.endDate) return null
  return clamp(
    { from: campaign.startDate, to: addDaysToDate(campaign.endDate, 1) },
    now,
  )
}

/**
 * From the Campaign's FIRST published Task to its end plus the tail, clamped
 * the same way. Null when the Campaign has published nothing: with no post
 * there is no tagged link, so an attributed number would be a claim about
 * traffic this Campaign cannot have caused.
 */
export function attributedWindow(
  campaign: OutcomeCampaign,
  tasks: readonly OutcomeTask[],
  now: Date,
): OutcomeWindow | null {
  const firstPublished = publishedDays(tasks).sort()[0]
  if (!firstPublished || !campaign.endDate) return null
  return clamp(
    {
      from: firstPublished,
      to: addDaysToDate(campaign.endDate, ATTRIBUTION_TAIL_DAYS + 1),
    },
    now,
  )
}

/** A Task is published when its variant says so AND we know when. */
function publishedDays(tasks: readonly OutcomeTask[]): string[] {
  const days: string[] = []
  for (const task of tasks) {
    if (task.variantStatus !== 'published' || !task.publishedAt) continue
    const day = conferenceDay(task.publishedAt)
    if (day) days.push(day)
  }
  return days
}

/** No window may reach into the day in progress: a part-day reading is unstable. */
function clamp(window: OutcomeWindow, now: Date): OutcomeWindow | null {
  const ceiling = conferenceDay(now)
  if (!ceiling) return null
  const to = window.to < ceiling ? window.to : ceiling
  return window.from < to ? { from: window.from, to } : null
}

function inWindow(day: string | null, window: OutcomeWindow | null): boolean {
  return !!window && !!day && day >= window.from && day < window.to
}

/** The Campaign's rows inside a window. Undated rows cannot be placed. */
function campaignRows(
  input: OutcomeInput,
  window: OutcomeWindow | null,
): CampaignBreakdownRow[] | null {
  if (input.rows === null) return null
  return input.rows.filter(
    (row) => row.campaign === input.campaign.key && inWindow(row.date, window),
  )
}

type CountColumn = 'sessions' | 'cfpClicks' | 'sponsorClicks' | 'checkoutClicks'

/**
 * Sum one column. `null` rows (the source failed) and a window that never
 * opened both stay `null`; a window that IS open with no matching rows is a
 * genuine zero.
 */
function sum(
  rows: CampaignBreakdownRow[] | null,
  window: OutcomeWindow | null,
  column: CountColumn,
): number | null {
  if (rows === null || window === null) return null
  return rows.reduce((total, row) => total + row[column], 0)
}

/** Every click a tagged link earned, whatever it was clicked towards. */
function clicksOf(row: CampaignBreakdownRow): number {
  return row.cfpClicks + row.sponsorClicks + row.checkoutClicks
}

/** The Campaign's published Bluesky posts, in Task order. */
function blueskyEngagements(
  input: OutcomeInput,
): (PostEngagement | null)[] | null {
  if (input.engagement === null) return null
  return input.tasks
    .filter(
      (task) =>
        task.channel === 'bluesky' &&
        task.variantStatus === 'published' &&
        task.postUri,
    )
    .map((task) => input.engagement?.get(task.postUri as string) ?? null)
}

/**
 * The whole reading for one Campaign. The primary Outcome, the three secondary
 * numbers every Campaign carries, and the per-Task breakdown — all over the
 * windows above.
 */
export function computeCampaignOutcome(input: OutcomeInput): OutcomeResult {
  const attributed = attributedWindow(input.campaign, input.tasks, input.now)
  const strict = strictWindow(input.campaign, input.now)
  const rows = campaignRows(input, attributed)

  const attributedSessions = sum(rows, attributed, 'sessions')
  const checkoutClickThrough = sum(rows, attributed, 'checkoutClicks')
  // `null` = Bluesky could not be read. An EMPTY list means it was read and the
  // Campaign has no published Bluesky post — a real zero, not an unknown.
  const engagements = blueskyEngagements(input)
  const blueskyInteractions =
    engagements === null
      ? null
      : engagements.length === 0
        ? 0
        : totalEngagement(engagements)

  const { value, attributedValue, isAttributed } = primaryOutcome(input, {
    rows,
    attributed,
    strict,
    attributedSessions,
    checkoutClickThrough,
    blueskyInteractions,
  })

  return {
    value,
    attributed: isAttributed,
    attributedValue,
    secondary: {
      attributedSessions,
      checkoutClickThrough,
      blueskyInteractions,
    },
    perTask: perTaskOutcomes(input, attributed),
    attributedWindow: attributed,
    strictWindow: strict,
  }
}

interface PrimaryContext {
  rows: CampaignBreakdownRow[] | null
  attributed: OutcomeWindow | null
  strict: OutcomeWindow | null
  attributedSessions: number | null
  checkoutClickThrough: number | null
  blueskyInteractions: number | null
}

function primaryOutcome(
  input: OutcomeInput,
  context: PrimaryContext,
): {
  value: number | null
  attributedValue: number | null
  isAttributed: boolean
} {
  const { campaign } = input
  switch (campaign.primaryOutcome) {
    case 'attributedSessions':
      return attributedOnly(context.attributedSessions)
    case 'checkoutClickThrough':
      return attributedOnly(context.checkoutClickThrough)
    case 'sponsorContactClicks':
      return attributedOnly(
        sum(context.rows, context.attributed, 'sponsorClicks'),
      )
    case 'blueskyInteractions':
      return attributedOnly(context.blueskyInteractions)
    case 'cfpSubmissions': {
      if (input.proposals === null || context.strict === null) {
        return { value: null, attributedValue: null, isAttributed: true }
      }
      const inRange = input.proposals.filter((proposal) =>
        inWindow(conferenceDay(proposal.createdAt), context.strict),
      )
      return {
        // The Outcome is every submission the Campaign ran alongside; the
        // tagged subset is reported next to it, never instead of it.
        value: inRange.length,
        attributedValue: inRange.filter(
          (proposal) => proposal.utmCampaign === campaign.key,
        ).length,
        isAttributed: true,
      }
    }
    case 'ticketsSoldInWindow': {
      if (input.tickets === null || context.strict === null) {
        return { value: null, attributedValue: null, isAttributed: false }
      }
      return {
        value: input.tickets.filter((ticket) =>
          inWindow(conferenceDay(ticket.orderDate), context.strict),
        ).length,
        attributedValue: null,
        // NOT attributed, and the ledger must say so: nothing here ties a sale
        // to this Campaign's links (spec §6.3).
        isAttributed: false,
      }
    }
  }
}

function attributedOnly(value: number | null) {
  return { value, attributedValue: null, isAttributed: true }
}

/**
 * Per-Task numbers over the CAMPAIGN's attributed window, so the Task rows add
 * up to the Campaign's own total rather than each carrying its own start.
 */
function perTaskOutcomes(
  input: OutcomeInput,
  window: OutcomeWindow | null,
): PerTaskOutcome[] {
  return input.tasks.map((task) => {
    const rows =
      input.rows === null
        ? null
        : input.rows.filter(
            (row) =>
              row.campaign === input.campaign.key &&
              row.task === task.key &&
              inWindow(row.date, window),
          )
    const engagement =
      task.postUri && input.engagement
        ? (input.engagement.get(task.postUri) ?? null)
        : null
    return {
      taskId: task._id,
      taskKey: task.key,
      sessions: sum(rows, window, 'sessions'),
      clicks:
        rows === null || window === null
          ? null
          : rows.reduce((total, row) => total + clicksOf(row), 0),
      engagement,
    }
  })
}
