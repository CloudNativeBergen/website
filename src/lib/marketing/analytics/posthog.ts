import type { AnalyticsCredentials } from '@/lib/secrets/types'
import {
  startOfTodayUtc,
  UNATTRIBUTED,
  type CampaignBreakdownFailureKind,
  type CampaignBreakdownInput,
  type CampaignBreakdownResult,
  type CampaignBreakdownRow,
  type MarketingAnalyticsProvider,
} from './types'

/**
 * PostHog attribution read-back over the Query API (#1009, spec §6.2): one
 * HogQL query per call, bound parameters, typed rows.
 *
 * QUERY FORM. The verified form from #1000
 * (`docs/research/posthog-consent-verification.md`): campaign and task are
 * `coalesce(properties.utm_*, session.$entry_utm_*)`. Accepting visitors
 * carry the landing UTMs as event properties (the init bridges them with
 * `register_for_session` after opt-in) and have no session entry; the
 * cookieless cohort (pending and declined) carries none on the click but sits
 * in a server session whose entry UTMs are populated. One form covers both,
 * so there is no primary/fallback switch — the flag the ticket anticipated
 * was made unnecessary by the verification result.
 */

/** The EU Cloud app host; `options.host` overrides it for tests. */
export const POSTHOG_QUERY_HOST = 'https://eu.posthog.com'

/** Wall-clock cap for one query; PostHog's own is 60 s. */
const DEFAULT_TIMEOUT_MS = 30_000

/** Shows up in PostHog's `query_log`, so a slow query is traceable to us. */
const QUERY_NAME = 'marketing-campaign-breakdown'

/**
 * `{conference}`, `{date_from}`, `{date_to}` are bound server-side through
 * the request's `values`, never interpolated: the conference id comes from a
 * document and the dates from the caller.
 */
export const CAMPAIGN_BREAKDOWN_HOGQL = `
SELECT coalesce(properties.utm_campaign, session.$entry_utm_campaign, '${UNATTRIBUTED}') AS campaign,
       coalesce(properties.utm_content, session.$entry_utm_content, '${UNATTRIBUTED}') AS task,
       uniq(events.$session_id) AS sessions,
       countIf(event = '$pageview') AS pageviews,
       countIf(event = '$autocapture' AND properties.cta LIKE 'cta-cfp-%') AS cfp_clicks,
       countIf(event = '$autocapture' AND properties.cta LIKE 'cta-sponsor-%') AS sponsor_clicks,
       countIf(event = '$autocapture' AND properties.cta LIKE 'outbound-%') AS checkout_clicks
FROM events
WHERE properties.conference = {conference}
  AND timestamp >= toDateTime({date_from}, 'UTC')
  AND timestamp < toDateTime({date_to}, 'UTC')
GROUP BY campaign, task
ORDER BY sessions DESC
LIMIT 1000
`.trim()

/** The columns the query aliases, in the order the adapter reads them back. */
const COLUMNS = [
  'campaign',
  'task',
  'sessions',
  'pageviews',
  'cfp_clicks',
  'sponsor_clicks',
  'checkout_clicks',
] as const

export interface PostHogAnalyticsOptions {
  fetch?: typeof fetch
  /** App host (not the ingest host); defaults to EU Cloud. */
  host?: string
  now?: () => Date
  timeoutMs?: number
}

export class PostHogAnalyticsProvider implements MarketingAnalyticsProvider {
  readonly name = 'posthog'
  private readonly fetchImpl: typeof fetch
  private readonly host: string
  private readonly now: () => Date
  private readonly timeoutMs: number

  constructor(
    private readonly credentials: AnalyticsCredentials,
    options: PostHogAnalyticsOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? fetch
    this.host = (options.host ?? POSTHOG_QUERY_HOST).replace(/\/+$/, '')
    this.now = options.now ?? (() => new Date())
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }

  async campaignBreakdown(
    input: CampaignBreakdownInput,
  ): Promise<CampaignBreakdownResult> {
    const invalid = validateRange(input, this.now())
    if (invalid) return { ok: false, kind: 'invalid-range', message: invalid }

    const url = `${this.host}/api/projects/${encodeURIComponent(
      this.credentials.projectId,
    )}/query/`
    const body = {
      query: {
        kind: 'HogQLQuery',
        query: CAMPAIGN_BREAKDOWN_HOGQL,
        values: {
          conference: input.conference,
          date_from: toHogqlDateTime(input.from),
          date_to: toHogqlDateTime(input.to),
        },
      },
      name: QUERY_NAME,
    }

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      return {
        ok: false,
        kind: 'transient',
        message: `PostHog query request failed: ${describe(error)}`,
      }
    }

    if (!response.ok) return failure(response, await safeText(response))

    let json: unknown
    try {
      json = await response.json()
    } catch {
      return {
        ok: false,
        kind: 'malformed',
        message: 'PostHog returned non-JSON',
      }
    }
    const rows = parseRows(json)
    if (!rows) {
      return {
        ok: false,
        kind: 'malformed',
        message: 'PostHog response did not carry the expected columns',
      }
    }
    return { ok: true, rows }
  }
}

/** A human-readable reason, or `null` when the range is usable. */
function validateRange(
  { from, to }: CampaignBreakdownInput,
  now: Date,
): string | null {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return 'from and to must be valid dates'
  }
  if (from.getTime() >= to.getTime()) return 'from must precede to'
  const ceiling = startOfTodayUtc(now)
  if (to.getTime() > ceiling.getTime()) {
    return `to must not pass the start of today (UTC): ${ceiling.toISOString()}`
  }
  return null
}

/** `YYYY-MM-DD HH:MM:SS` in UTC — what `toDateTime(x, 'UTC')` parses strictly. */
function toHogqlDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function failure(
  response: Response,
  detail: string,
): Extract<CampaignBreakdownResult, { ok: false }> {
  const { status } = response
  const message = `PostHog query returned ${status}${detail ? `: ${detail}` : ''}`
  let kind: CampaignBreakdownFailureKind
  if (status === 401 || status === 403) kind = 'unauthorized'
  else if (status === 429) kind = 'rate-limited'
  else if (status >= 500) kind = 'transient'
  else kind = 'rejected'
  const retryAfter =
    kind === 'rate-limited'
      ? parseRetryAfter(response.headers.get('retry-after'))
      : undefined
  return retryAfter
    ? { ok: false, kind, message, retryAfter }
    : { ok: false, kind, message }
}

function parseRetryAfter(header: string | null): Date | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return new Date(Date.now() + seconds * 1000)
  }
  const at = new Date(header)
  return Number.isNaN(at.getTime()) ? undefined : at
}

/** Keep the vendor's error `detail` short; never echo a whole HTML page. */
async function safeText(response: Response): Promise<string> {
  try {
    const text = await response.text()
    try {
      const parsed: unknown = JSON.parse(text)
      if (isRecord(parsed) && typeof parsed.detail === 'string') {
        return parsed.detail.slice(0, 300)
      }
    } catch {
      // not JSON — fall through to the raw text
    }
    return text.slice(0, 300)
  } catch {
    return ''
  }
}

/**
 * Read rows by COLUMN NAME, not position: the response's `columns` is the
 * contract, and a vendor-side reordering must not silently swap counts.
 */
function parseRows(json: unknown): CampaignBreakdownRow[] | null {
  if (!isRecord(json)) return null
  const { columns, results } = json
  if (!isStringArray(columns) || !Array.isArray(results)) return null
  const index = new Map(columns.map((name, i) => [name, i] as const))
  if (COLUMNS.some((name) => !index.has(name))) return null
  const at = (row: unknown[], name: (typeof COLUMNS)[number]): unknown =>
    row[index.get(name) as number]

  const rows: CampaignBreakdownRow[] = []
  for (const row of results) {
    if (!Array.isArray(row)) return null
    const sessions = count(at(row, 'sessions'))
    const pageviews = count(at(row, 'pageviews'))
    const cfpClicks = count(at(row, 'cfp_clicks'))
    const sponsorClicks = count(at(row, 'sponsor_clicks'))
    const checkoutClicks = count(at(row, 'checkout_clicks'))
    if (
      sessions === null ||
      pageviews === null ||
      cfpClicks === null ||
      sponsorClicks === null ||
      checkoutClicks === null
    ) {
      return null
    }
    rows.push({
      campaign: label(at(row, 'campaign')),
      task: label(at(row, 'task')),
      sessions,
      pageviews,
      cfpClicks,
      sponsorClicks,
      checkoutClicks,
    })
  }
  return rows
}

/** A non-negative integer, or `null` — a count that is not one is a bug upstream. */
function count(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null
}

/** The SQL already coalesces, but a null or empty key must still bucket. */
function label(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value : UNATTRIBUTED
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

function describe(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error)
}
