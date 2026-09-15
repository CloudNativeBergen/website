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

/** Midnight UTC of `now`'s date — the latest `to` a caller may pass. */
export function startOfTodayUtc(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
}
