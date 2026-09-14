import { describe, expect, it, vi } from 'vitest'
import {
  CAMPAIGN_BREAKDOWN_HOGQL,
  POSTHOG_QUERY_HOST,
  PostHogAnalyticsProvider,
} from '../posthog'
import { startOfTodayUtc, UNATTRIBUTED } from '../types'
import {
  getMarketingAnalyticsProvider,
  resolveMarketingAnalyticsProvider,
} from '../index'

const CREDENTIALS = { projectId: '273627', apiKey: 'phx_test_key' }
const NOW = new Date('2026-09-14T10:30:00Z')
const FROM = new Date('2026-09-01T00:00:00Z')
const TO = new Date('2026-09-14T00:00:00Z') // = startOfTodayUtc(NOW)

const COLUMNS = [
  'campaign',
  'task',
  'sessions',
  'pageviews',
  'cfp_clicks',
  'sponsor_clicks',
  'checkout_clicks',
]

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function provider(fetchImpl: typeof fetch, now = () => NOW) {
  return new PostHogAnalyticsProvider(CREDENTIALS, { fetch: fetchImpl, now })
}

/** The one request the fake fetch saw, decoded. */
function requestOf(fetchMock: ReturnType<typeof vi.fn>) {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return { url, init, body: JSON.parse(String(init.body)) }
}

describe('PostHogAnalyticsProvider — request shape', () => {
  it('POSTs one HogQLQuery to the project query endpoint with the bearer key', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ columns: COLUMNS, results: [] }),
    )
    const result = await provider(fetchMock).campaignBreakdown({
      conference: 'conf-1',
      from: FROM,
      to: TO,
    })
    expect(result).toEqual({ ok: true, rows: [] })

    const { url, init, body } = requestOf(fetchMock)
    expect(url).toBe(`${POSTHOG_QUERY_HOST}/api/projects/273627/query/`)
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer phx_test_key',
    )
    expect(new Headers(init.headers).get('content-type')).toBe(
      'application/json',
    )
    expect(body.query.kind).toBe('HogQLQuery')
    expect(body.query.query).toBe(CAMPAIGN_BREAKDOWN_HOGQL)
    expect(typeof body.name).toBe('string')
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('binds conference and range as values, never interpolated into the SQL', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ columns: COLUMNS, results: [] }),
    )
    const conference = "conf-1' OR 1=1 --"
    await provider(fetchMock).campaignBreakdown({
      conference,
      from: FROM,
      to: TO,
    })

    const { body } = requestOf(fetchMock)
    expect(body.query.values).toEqual({
      conference,
      date_from: '2026-09-01 00:00:00',
      date_to: '2026-09-14 00:00:00',
    })
    expect(body.query.query).not.toContain(conference)
    expect(body.query.query).not.toContain('2026-09')
    expect(body.query.query).toContain('{conference}')
    expect(body.query.query).toContain("toDateTime({date_from}, 'UTC')")
    expect(body.query.query).toContain("toDateTime({date_to}, 'UTC')")
  })

  it('uses the verified coalesce form: event utm_* first, session entry as the join for the cookieless cohort (#1000)', () => {
    expect(CAMPAIGN_BREAKDOWN_HOGQL).toContain(
      `coalesce(properties.utm_campaign, session.$entry_utm_campaign, '${UNATTRIBUTED}') AS campaign`,
    )
    expect(CAMPAIGN_BREAKDOWN_HOGQL).toContain(
      `coalesce(properties.utm_content, session.$entry_utm_content, '${UNATTRIBUTED}') AS task`,
    )
    expect(CAMPAIGN_BREAKDOWN_HOGQL).toContain('uniq(events.$session_id)')
    expect(CAMPAIGN_BREAKDOWN_HOGQL).toContain(
      "properties.cta LIKE 'cta-cfp-%'",
    )
    expect(CAMPAIGN_BREAKDOWN_HOGQL).toContain(
      "properties.cta LIKE 'cta-sponsor-%'",
    )
    expect(CAMPAIGN_BREAKDOWN_HOGQL).toContain(
      "properties.cta LIKE 'outbound-%'",
    )
    expect(CAMPAIGN_BREAKDOWN_HOGQL).toContain('GROUP BY campaign, task')
  })

  it('honours a custom host without a trailing slash and encodes the project id', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ columns: COLUMNS, results: [] }),
    )
    const p = new PostHogAnalyticsProvider(
      { projectId: 'a/b', apiKey: 'k' },
      { fetch: fetchMock, host: 'http://localhost:9999/', now: () => NOW },
    )
    await p.campaignBreakdown({ conference: 'c', from: FROM, to: TO })
    expect(requestOf(fetchMock).url).toBe(
      'http://localhost:9999/api/projects/a%2Fb/query/',
    )
  })
})

describe('PostHogAnalyticsProvider — never queries up to now', () => {
  it('refuses a `to` past the start of today (UTC) without touching the network', async () => {
    const fetchMock = vi.fn()
    const result = await provider(fetchMock).campaignBreakdown({
      conference: 'c',
      from: FROM,
      to: new Date('2026-09-14T00:00:01Z'),
    })
    expect(result).toMatchObject({ ok: false, kind: 'invalid-range' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts `to` exactly at the start of today', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ columns: COLUMNS, results: [] }),
    )
    const result = await provider(fetchMock).campaignBreakdown({
      conference: 'c',
      from: FROM,
      to: startOfTodayUtc(NOW),
    })
    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refuses an empty or inverted range and invalid dates', async () => {
    const fetchMock = vi.fn()
    const p = provider(fetchMock)
    await expect(
      p.campaignBreakdown({ conference: 'c', from: TO, to: TO }),
    ).resolves.toMatchObject({ ok: false, kind: 'invalid-range' })
    await expect(
      p.campaignBreakdown({ conference: 'c', from: TO, to: FROM }),
    ).resolves.toMatchObject({ ok: false, kind: 'invalid-range' })
    await expect(
      p.campaignBreakdown({
        conference: 'c',
        from: new Date('nope'),
        to: TO,
      }),
    ).resolves.toMatchObject({ ok: false, kind: 'invalid-range' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('startOfTodayUtc is midnight UTC of the given instant', () => {
    expect(startOfTodayUtc(new Date('2026-09-14T23:59:59.999Z'))).toEqual(
      new Date('2026-09-14T00:00:00Z'),
    )
    expect(startOfTodayUtc(new Date('2026-09-14T00:00:00Z'))).toEqual(
      new Date('2026-09-14T00:00:00Z'),
    )
  })
})

describe('PostHogAnalyticsProvider — response parsing', () => {
  it('maps rows by column name, so a reordered response cannot swap counts', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        columns: [
          'checkout_clicks',
          'task',
          'sessions',
          'campaign',
          'pageviews',
          'sponsor_clicks',
          'cfp_clicks',
        ],
        results: [
          [3, 'launch-post', 42, 'spring-cfp', 60, 1, 7],
          [0, UNATTRIBUTED, 5, UNATTRIBUTED, 9, 0, 0],
        ],
        types: [],
        hogql: 'SELECT …',
      }),
    )
    const result = await provider(fetchMock).campaignBreakdown({
      conference: 'c',
      from: FROM,
      to: TO,
    })
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          campaign: 'spring-cfp',
          task: 'launch-post',
          sessions: 42,
          pageviews: 60,
          cfpClicks: 7,
          sponsorClicks: 1,
          checkoutClicks: 3,
        },
        {
          campaign: UNATTRIBUTED,
          task: UNATTRIBUTED,
          sessions: 5,
          pageviews: 9,
          cfpClicks: 0,
          sponsorClicks: 0,
          checkoutClicks: 0,
        },
      ],
    })
  })

  it('buckets a null or blank key as unattributed and accepts numeric strings', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        columns: COLUMNS,
        results: [[null, '  ', '12', 20, 0, 0, '1']],
      }),
    )
    const result = await provider(fetchMock).campaignBreakdown({
      conference: 'c',
      from: FROM,
      to: TO,
    })
    expect(result).toEqual({
      ok: true,
      rows: [
        {
          campaign: UNATTRIBUTED,
          task: UNATTRIBUTED,
          sessions: 12,
          pageviews: 20,
          cfpClicks: 0,
          sponsorClicks: 0,
          checkoutClicks: 1,
        },
      ],
    })
  })

  it.each([
    ['a missing column', { columns: COLUMNS.slice(0, 6), results: [] }],
    ['no results array', { columns: COLUMNS }],
    ['a non-array row', { columns: COLUMNS, results: [{ campaign: 'x' }] }],
    [
      'a negative count',
      { columns: COLUMNS, results: [['a', 'b', -1, 0, 0, 0, 0]] },
    ],
    [
      'a fractional count',
      { columns: COLUMNS, results: [['a', 'b', 1.5, 0, 0, 0, 0]] },
    ],
    [
      'a non-numeric count',
      { columns: COLUMNS, results: [['a', 'b', 'lots', 0, 0, 0, 0]] },
    ],
    ['a non-object body', [1, 2, 3]],
  ])('is `malformed` on %s rather than guessing', async (_label, body) => {
    const fetchMock = vi.fn(async () => jsonResponse(body))
    const result = await provider(fetchMock).campaignBreakdown({
      conference: 'c',
      from: FROM,
      to: TO,
    })
    expect(result).toMatchObject({ ok: false, kind: 'malformed' })
  })

  it('is `malformed` on a 200 that is not JSON', async () => {
    const fetchMock = vi.fn(async () => new Response('<html>', { status: 200 }))
    const result = await provider(fetchMock).campaignBreakdown({
      conference: 'c',
      from: FROM,
      to: TO,
    })
    expect(result).toMatchObject({ ok: false, kind: 'malformed' })
  })
})

describe('PostHogAnalyticsProvider — failures are typed, never thrown', () => {
  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [400, 'rejected'],
    [404, 'rejected'],
    [500, 'transient'],
    [503, 'transient'],
  ])(
    'maps HTTP %i to %s and carries the vendor detail',
    async (status, kind) => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ type: 'x', detail: 'Query failed loudly' }, { status }),
      )
      const result = await provider(fetchMock).campaignBreakdown({
        conference: 'c',
        from: FROM,
        to: TO,
      })
      expect(result).toMatchObject({ ok: false, kind })
      if (!result.ok) {
        expect(result.message).toContain(String(status))
        expect(result.message).toContain('Query failed loudly')
      }
    },
  )

  it('maps 429 to rate-limited with retryAfter from the header', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('slow down', {
          status: 429,
          headers: { 'retry-after': '120' },
        }),
    )
    const before = Date.now()
    const result = await provider(fetchMock).campaignBreakdown({
      conference: 'c',
      from: FROM,
      to: TO,
    })
    expect(result).toMatchObject({ ok: false, kind: 'rate-limited' })
    if (!result.ok) {
      expect(result.retryAfter).toBeInstanceOf(Date)
      expect(result.retryAfter!.getTime()).toBeGreaterThanOrEqual(
        before + 119_000,
      )
    }
  })

  it('is transient on a network error or timeout', async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException('The operation timed out', 'TimeoutError')
    })
    const result = await provider(fetchMock).campaignBreakdown({
      conference: 'c',
      from: FROM,
      to: TO,
    })
    expect(result).toMatchObject({ ok: false, kind: 'transient' })
    if (!result.ok) expect(result.message).toContain('TimeoutError')
  })
})

describe('factory + resolver', () => {
  it('builds a provider only from a complete bag', () => {
    expect(getMarketingAnalyticsProvider(CREDENTIALS)?.name).toBe('posthog')
    expect(getMarketingAnalyticsProvider({ projectId: '1' })).toBeNull()
    expect(getMarketingAnalyticsProvider({ apiKey: 'k' })).toBeNull()
    expect(
      getMarketingAnalyticsProvider({ projectId: ' ', apiKey: 'k' }),
    ).toBeNull()
    expect(getMarketingAnalyticsProvider(null)).toBeNull()
  })

  it('resolves through the injected org-scoped lookup, analytics family only', async () => {
    const secrets = vi.fn(async () => CREDENTIALS)
    const p = await resolveMarketingAnalyticsProvider('org-1', secrets)
    expect(p?.name).toBe('posthog')
    expect(secrets).toHaveBeenCalledWith('org-1', 'analytics')
  })

  it('is null for a missing org or an org without the family, without a lookup for the former', async () => {
    const secrets = vi.fn(async () => null)
    expect(await resolveMarketingAnalyticsProvider(null, secrets)).toBeNull()
    expect(await resolveMarketingAnalyticsProvider('', secrets)).toBeNull()
    expect(secrets).not.toHaveBeenCalled()
    expect(await resolveMarketingAnalyticsProvider('org-2', secrets)).toBeNull()
    expect(secrets).toHaveBeenCalledTimes(1)
  })
})
