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
}

export interface CampaignBreakdownRow {
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
