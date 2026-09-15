/**
 * The attribution read-back contract (#1009, spec §6.2), in the house pattern
 * of docs/INTEGRATION_ADAPTERS.md: a neutral interface, one class per vendor,
 * credentials INJECTED at construction — nothing ambient inside.
 *
 * One method: sessions and CTA clicks for one conference and one half-open
 * range `[from, to)`, grouped by Campaign key (`utm_campaign`) and Task key
 * (`utm_content`). Everything the Marketing Report and the snapshot cron
 * need is a filter over these rows (spec §6.3).
 */

/** The bucket untagged traffic lands in — no `utm_campaign` or `utm_content`. */
export const UNATTRIBUTED = '(none)'

export interface CampaignBreakdownInput {
  /** The conference document id — the `conference` super property. */
  conference: string
  /** Inclusive start of the range. */
  from: Date
  /**
   * Exclusive end of the range. Must not be past the start of today (UTC):
   * a query that reaches into the current day is never stable, so the cron
   * passes {@link startOfTodayUtc} (spec §6.2 "never query up to now").
   */
  to: Date
  /**
   * `'total'` (the default) is one row per `(campaign, task)` for the whole
   * range. `'day'` breaks the same rows down by UTC calendar day, which is what
   * the snapshot cron needs: spec §6.4 allows it ONE call per conference while
   * §6.3 gives every Campaign its own window, and only a dated row serves both.
   */
  grain?: BreakdownGrain
  /**
   * Which zone a `'day'` is measured in; IANA name, `'UTC'` by default. The
   * caller's own calendar decides this: a Campaign window is a range of
   * CONFERENCE days, so grouping the events by UTC days would put an hour of
   * every edge day in the wrong bucket.
   */
  timeZone?: string
}

export type BreakdownGrain = 'total' | 'day'

export interface CampaignBreakdownRow {
  /**
   * The UTC calendar day (`YYYY-MM-DD`) the counts fall on, or `null` for a
   * `'total'` breakdown.
   *
   * ADDITIVITY: `pageviews` and the three click columns are plain counts and
   * sum exactly across days. `sessions` is a per-day `uniq`, so a session that
   * spans midnight UTC is counted in BOTH days and a summed range can read
   * slightly high. That is the price of one query per conference (§6.4); it
   * moves a funnel's top number by a session or two, never an Outcome's
   * click count.
   */
  date: string | null
  /** `utm_campaign`, or {@link UNATTRIBUTED}. */
  campaign: string
  /** `utm_content`, or {@link UNATTRIBUTED}. */
  task: string
  sessions: number
  pageviews: number
  /** `$autocapture` clicks on `cta-cfp-*` elements. */
  cfpClicks: number
  /** `$autocapture` clicks on `cta-sponsor-*` elements. */
  sponsorClicks: number
  /** `$autocapture` clicks on `outbound-*` elements (ticket checkout). */
  checkoutClicks: number
}

export type CampaignBreakdownFailureKind =
  /** The input range is empty, inverted, or reaches into today. */
  | 'invalid-range'
  /** The key is missing, expired, or lacks `query:read` on the project. */
  | 'unauthorized'
  /** The vendor throttled the request; retry after `retryAfter` when given. */
  | 'rate-limited'
  /** The vendor refused the query (4xx other than auth/throttle). */
  | 'rejected'
  /** Network failure, timeout, or a 5xx — the same query may succeed later. */
  | 'transient'
  /** A 2xx whose body is not the shape this adapter understands. */
  | 'malformed'

/** Typed outcomes are the API; exceptions are bugs. */
export type CampaignBreakdownResult =
  | {
      ok: true
      rows: CampaignBreakdownRow[]
      /** The query's row cap was reached; the smallest groups may be missing. */
      truncated: boolean
    }
  | {
      ok: false
      kind: CampaignBreakdownFailureKind
      message: string
      /** From vendor rate-limit headers. */
      retryAfter?: Date
    }

export interface MarketingAnalyticsProvider {
  readonly name: string
  campaignBreakdown(
    input: CampaignBreakdownInput,
  ): Promise<CampaignBreakdownResult>
}

/** Midnight UTC of `now`'s date — the latest `to` a UTC-grained caller may pass. */
export function startOfTodayUtc(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
}

/**
 * The instant the current day began IN `timeZone` — the latest `to` a caller
 * grouping by that zone's days may pass.
 *
 * WHY NOT ALWAYS UTC: a caller grouping by conference days asks for a range
 * ending at the conference's midnight, which for a zone EAST of Greenwich is
 * later than UTC midnight for the last hour or two of the UTC day. Judging
 * that range by the UTC ceiling would refuse a perfectly stable query — every
 * evening, and only in the evening.
 *
 * DST-correct by the two-pass solve the platform's own Oslo helper uses: the
 * zone's offset is resolved at the naive instant and then re-resolved at the
 * result, so a midnight on either side of a transition lands where it should.
 * An unknown zone name falls back to the UTC ceiling, which is the stricter
 * of the two.
 */
export function startOfTodayIn(timeZone: string, now: Date = new Date()): Date {
  if (timeZone === 'UTC') return startOfTodayUtc(now)
  try {
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
    const naive = Date.parse(`${day}T00:00:00Z`)
    if (Number.isNaN(naive)) return startOfTodayUtc(now)
    let instant = naive - zoneOffsetMs(timeZone, new Date(naive))
    const secondPass = naive - zoneOffsetMs(timeZone, new Date(instant))
    if (secondPass !== instant) instant = secondPass
    return new Date(instant)
  } catch {
    return startOfTodayUtc(now)
  }
}

/** How far ahead of UTC `timeZone` is at `at`, in milliseconds. */
function zoneOffsetMs(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at)
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? NaN)
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return Number.isNaN(asUtc) ? 0 : asUtc - at.getTime()
}
