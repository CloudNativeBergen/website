import type { AnalyticsCredentials } from '@/lib/secrets/types'
import { describeError, isJsonObject, parseRetryAfter } from '@/lib/vendor/http'
import {
  startOfTodayUtc,
  UNATTRIBUTED,
  type BreakdownGrain,
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
 * QUERY FORM. The verified form from #1000 (findings on branch
 * `research/posthog-consent-verification`, summarised in spec §6.2 and on
 * the issue): campaign and task are
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

/** Wall-clock cap for the whole exchange; PostHog itself kills a query at ~10 s. */
const DEFAULT_TIMEOUT_MS = 30_000

/** Shows up in PostHog's `query_log`, so a slow query is traceable to us. */
export const QUERY_NAME = 'marketing-campaign-breakdown'

/** The count columns the query aliases, read back by name. */
const COUNT_COLUMNS = [
  'sessions',
  'pageviews',
  'cfp_clicks',
  'sponsor_clicks',
  'checkout_clicks',
] as const

const KEY_COLUMNS = ['campaign', 'task'] as const

type Column =
  'day' | (typeof KEY_COLUMNS)[number] | (typeof COUNT_COLUMNS)[number]

/**
 * The query's own row cap; a result this long may have been cut. A `'total'`
 * breakdown has one row per `(campaign, task)`; a `'day'` breakdown multiplies
 * that by the number of active days, so it gets a much higher ceiling.
 */
export const ROW_LIMIT = 1000
export const DAY_ROW_LIMIT = 50_000

/**
 * EVERYTHING that differs between the two grains, in one place. Spreading the
 * difference over a row cap, three SQL fragments, a column list and a parser
 * branch is how the day column and the day GROUP BY drift apart.
 */
interface GrainShape {
  rowLimit: number
  /** Extra SELECT line, already indented, or `''`. */
  selectLine: string
  /** Extra leading GROUP BY / ORDER BY term, or `''`. */
  groupTerm: string
  orderTerm: string
  columns: readonly Column[]
}

const GRAINS: Record<BreakdownGrain, GrainShape> = {
  total: {
    rowLimit: ROW_LIMIT,
    selectLine: '',
    groupTerm: '',
    orderTerm: '',
    columns: [...KEY_COLUMNS, ...COUNT_COLUMNS],
  },
  day: {
    rowLimit: DAY_ROW_LIMIT,
    selectLine: "toString(toDate(timestamp, 'UTC')) AS day,\n       ",
    groupTerm: 'day, ',
    orderTerm: 'day ASC, ',
    columns: ['day', ...KEY_COLUMNS, ...COUNT_COLUMNS],
  },
}

export function rowLimitFor(grain: BreakdownGrain): number {
  return GRAINS[grain].rowLimit
}

/**
 * `{conference}`, `{date_from}`, `{date_to}` are bound server-side through
 * the request's `values`, never interpolated: the conference id comes from a
 * document and the dates from the caller.
 *
 * `nullIf(trim(x), '')`: a hand-mangled link (`?utm_campaign=` or
 * `=%20`) sends an empty or blank key, which `coalesce` would keep as its
 * own group; folding it into the unattributed bucket IN the SQL keeps
 * `(campaign, task)` unique in the result — the client cannot merge rows
 * after the grouping has happened.
 *
 * `'day'` adds a `day` column (`toDate(timestamp, 'UTC')`) and groups by it, so
 * the caller can sum the days that fall inside each Campaign's own window.
 */
export function campaignBreakdownHogql(grain: BreakdownGrain): string {
  const { selectLine, groupTerm, orderTerm, rowLimit } = GRAINS[grain]
  return `
SELECT ${selectLine}coalesce(nullIf(trim(properties.utm_campaign), ''), nullIf(trim(session.$entry_utm_campaign), ''), '${UNATTRIBUTED}') AS campaign,
       coalesce(nullIf(trim(properties.utm_content), ''), nullIf(trim(session.$entry_utm_content), ''), '${UNATTRIBUTED}') AS task,
       uniq(events.$session_id) AS sessions,
       countIf(event = '$pageview') AS pageviews,
       countIf(event = '$autocapture' AND properties.cta LIKE 'cta-cfp-%') AS cfp_clicks,
       countIf(event = '$autocapture' AND properties.cta LIKE 'cta-sponsor-%') AS sponsor_clicks,
       countIf(event = '$autocapture' AND properties.cta LIKE 'outbound-%') AS checkout_clicks
FROM events
WHERE properties.conference = {conference}
  AND timestamp >= toDateTime({date_from}, 'UTC')
  AND timestamp < toDateTime({date_to}, 'UTC')
GROUP BY ${groupTerm}campaign, task
ORDER BY ${orderTerm}sessions DESC
LIMIT ${rowLimit}
`.trim()
}

/** The `'total'` form, kept as a named export for the tests that pin it. */
export const CAMPAIGN_BREAKDOWN_HOGQL = campaignBreakdownHogql('total')

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

    const grain: BreakdownGrain = input.grain ?? 'total'

    const url = `${this.host}/api/projects/${encodeURIComponent(
      this.credentials.projectId,
    )}/query/`
    const body = {
      query: {
        kind: 'HogQLQuery',
        query: campaignBreakdownHogql(grain),
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
        message: `PostHog query request failed: ${describeError(error)}`,
      }
    }

    // Reading the body is still transport: a stalled stream after the
    // headers (the timeout firing mid-body) is `transient`, not `malformed`.
    let text: string
    try {
      text = await response.text()
    } catch (error) {
      return {
        ok: false,
        kind: 'transient',
        message: `PostHog query body failed: ${describeError(error)}`,
      }
    }
    if (!response.ok) return failure(response, detailOf(text), this.now())

    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      return {
        ok: false,
        kind: 'malformed',
        message: 'PostHog returned non-JSON',
      }
    }
    const parsed = parseRows(json, grain)
    if ('problem' in parsed) {
      return {
        ok: false,
        kind: 'malformed',
        message: `PostHog response ${parsed.problem}`,
      }
    }
    return {
      ok: true,
      rows: parsed.rows,
      truncated: parsed.rows.length >= rowLimitFor(grain),
    }
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
  // HogQL's toDateTime is second-precise; a boundary the query cannot
  // express is refused rather than silently rounded.
  if (from.getTime() % 1000 !== 0 || to.getTime() % 1000 !== 0) {
    return 'from and to must be whole seconds'
  }
  const ceiling = startOfTodayUtc(now)
  if (to.getTime() > ceiling.getTime()) {
    return `to must not pass the start of today (UTC): ${ceiling.toISOString()}`
  }
  return null
}

/**
 * `YYYY-MM-DD HH:MM:SS` in UTC — what `toDateTime(x, 'UTC')` parses
 * strictly. Whole seconds only; `validateRange` has already refused the rest.
 */
function toHogqlDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function failure(
  response: Response,
  detail: string,
  now: Date,
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
      ? parseRetryAfter(response.headers.get('retry-after'), now)
      : undefined
  return retryAfter
    ? { ok: false, kind, message, retryAfter }
    : { ok: false, kind, message }
}

/** Keep the vendor's error `detail` short; never echo a whole HTML page. */
function detailOf(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text)
    if (isJsonObject(parsed) && typeof parsed.detail === 'string') {
      return parsed.detail.slice(0, 300)
    }
  } catch {
    // not JSON — fall through to the raw text
  }
  return text.slice(0, 300)
}

type Parsed = { rows: CampaignBreakdownRow[] } | { problem: string }

/**
 * Read rows by COLUMN NAME, not position: the response's `columns` is the
 * contract, and a vendor-side reordering must not silently swap counts.
 * Every refusal names what was wrong, so an operator reading the message
 * is not sent to check the columns when a count was the problem.
 */
function parseRows(json: unknown, grain: BreakdownGrain): Parsed {
  if (!isJsonObject(json)) return { problem: 'is not an object' }
  const { columns, results } = json
  if (!isStringArray(columns)) return { problem: 'has no columns array' }
  if (!Array.isArray(results)) return { problem: 'has no results array' }
  const index = new Map(columns.map((name, i) => [name, i] as const))
  const expected = GRAINS[grain].columns
  const missing = expected.filter((name) => !index.has(name))
  if (missing.length > 0) {
    return { problem: `lacks column(s) ${missing.join(', ')}` }
  }
  const at = (row: unknown[], name: Column): unknown =>
    row[index.get(name) as number]

  const rows: CampaignBreakdownRow[] = []
  for (const [i, row] of results.entries()) {
    if (!Array.isArray(row)) return { problem: `row ${i} is not an array` }
    const counts: number[] = []
    for (const name of COUNT_COLUMNS) {
      const n = count(at(row, name))
      if (n === null) {
        return {
          problem: `row ${i} has a non-count ${name}: ${String(at(row, name))}`,
        }
      }
      counts.push(n)
    }
    const [sessions, pageviews, cfpClicks, sponsorClicks, checkoutClicks] =
      counts
    let date: string | null = null
    if (grain === 'day') {
      date = calendarDay(at(row, 'day'))
      if (date === null) {
        return {
          problem: `row ${i} has a non-date day: ${String(at(row, 'day'))}`,
        }
      }
    }
    rows.push({
      date,
      campaign: label(at(row, 'campaign')),
      task: label(at(row, 'task')),
      sessions,
      pageviews,
      cfpClicks,
      sponsorClicks,
      checkoutClicks,
    })
  }
  return { rows }
}

/**
 * A non-negative integer, or `null`. Numbers are what PostHog serialises;
 * a digit string is tolerated for a UInt64 past the JSON number range, but
 * a blank cell is NOT a zero.
 */
function count(value: unknown): number | null {
  if (typeof value === 'string') {
    return /^\d+$/.test(value) ? Number(value) : null
  }
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : null
}

/**
 * `YYYY-MM-DD`, or `null`. `toString(toDate(...))` serialises exactly that;
 * anything else means the column is not the day column we asked for.
 */
function calendarDay(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

/** The SQL already trims and coalesces; this only guards a non-string cell. */
function label(value: unknown): string {
  return typeof value === 'string' && value !== '' ? value : UNATTRIBUTED
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}
