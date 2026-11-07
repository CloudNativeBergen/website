import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mapBackfill,
  type Row,
  type SanityConference,
} from '../../scripts/backfill'
import { findDrift, scheduled, window } from './parity'

const SECRET = 'S3CRET-VALUE'
const doc: SanityConference = {
  _id: 'c1',
  orgId: 'o1',
  title: 'Konf',
  city: 'Bergen',
  tagline: '',
  startDate: '2026-10-01',
  socialLinks: ['https://x.test'],
}
// The D1 row as the site writes it: '' stored as null, links as JSON text.
const d1 = (over: Partial<Row> = {}): Row => ({
  ...mapBackfill([doc], new Set(['c1'])).rows[0],
  tagline: null,
  ...over,
})

const fetchMock = vi.fn()
const emit = vi.fn()
vi.mock('../push', () => ({ emit: (e: unknown) => emit(e) }))
vi.mock('@sanity/client', () => ({
  createClient: () => ({ fetch: fetchMock }),
}))

describe('findDrift', () => {
  it('is clean when D1 equals Sanity after normalisation', () => {
    expect(findDrift([d1({ city: ' Bergen ' })], [doc])).toEqual([])
  })

  // One seeded mismatch per column type: text, date, enum, boolean, JSON
  // array, and the org key.
  it.each([
    ['title', { title: 'Old' }],
    ['tagline', { tagline: 'set in D1 only' }],
    ['start_date', { start_date: '2026-10-02' }],
    ['end_date', { end_date: '2026-10-03' }],
    ['visibility', { visibility: 'unlisted' as const }],
    ['published', { published: 0 as const }],
    ['social_links', { social_links: '[]' }],
    ['org_id', { org_id: 'o2' }],
    ['primary_color', { primary_color: '#fff' }],
    // Settings phase 1 (#2019): the members-only columns have no anonymous
    // gateway parity, so this sweep is their only check.
    ['organizer_address', { organizer_address: 'Gate 1' }],
    ['organizer_org_number', { organizer_org_number: '999' }],
    ['analytics_pirsch_code', { analytics_pirsch_code: 'abc' }],
    ['travel_support_budget', { travel_support_budget: 5 }],
    ['registration_enabled', { registration_enabled: 1 as const }],
  ])('reports a mismatch in %s', (field, over) => {
    expect(findDrift([d1(over)], [doc])).toEqual([
      { conferenceId: 'c1', fields: [field] },
    ])
  })

  it('compares every column the backfill writes', () => {
    const row = d1()
    for (const col of Object.keys(row) as (keyof Row)[]) {
      if (col === 'conference_id') continue
      const v =
        col === 'social_links' ? '["y"]' : col === 'published' ? 0 : 'zz'
      expect(findDrift([{ ...row, [col]: v }], [doc])).toEqual([
        { conferenceId: 'c1', fields: [col] },
      ])
    }
  })

  it('reports a row Sanity no longer has', () => {
    expect(findDrift([d1()], [])).toEqual([
      { conferenceId: 'c1', fields: ['(missing in sanity)'] },
    ])
  })
})

describe('window', () => {
  it('rotates through all ids across days, capped per run', () => {
    const ids = [1, 2, 3, 4, 5]
    const seen = new Set<number>()
    for (let day = 0; day < 3; day++) {
      const w = window(ids, day * 86_400_000, 2)
      expect(w).toHaveLength(2)
      w.forEach((i) => seen.add(i))
    }
    expect(seen.size).toBe(5)
    expect(window(ids, 0, 10)).toEqual(ids)
  })
})

describe('scheduled', () => {
  let logs: string[]
  beforeEach(() => {
    fetchMock.mockReset()
    logs = []
    const keep = (m: string) => void logs.push(m)
    vi.spyOn(console, 'error').mockImplementation(keep)
    vi.spyOn(console, 'log').mockImplementation(keep)
  })
  afterEach(() => vi.restoreAllMocks())

  const envWith = (rows: Row[], over = {}) => ({
    DB: {
      prepare: vi.fn(() => ({
        all: async () => ({ results: rows }),
        bind: () => ({ run: async () => ({ success: true }) }),
      })),
    } as unknown as D1Database,
    SANITY_PROJECT_ID: 'p',
    SANITY_DATASET: 'd',
    SANITY_API_TOKEN_READ: 't',
    ...over,
  })
  const events = () => logs.map((l) => JSON.parse(l))
  const summary = () =>
    events().find((e) => e.event === 'conference.parity.sweep')

  it('emits parity.drift with conference ids only, and nothing in sync', async () => {
    emit.mockReset()
    fetchMock.mockResolvedValue([doc])
    await scheduled(envWith([d1()]))
    expect(emit).not.toHaveBeenCalled()
    await scheduled(envWith([d1({ contact_email: SECRET })]))
    expect(emit.mock.calls).toEqual([
      [{ type: 'parity.drift', conferenceIds: ['c1'] }],
    ])
  })

  it('reports in_sync with zero diffs', async () => {
    fetchMock.mockResolvedValue([doc])
    await scheduled(envWith([d1()]))
    expect(events()).toEqual([
      {
        event: 'conference.parity.sweep',
        status: 'in_sync',
        checked: 1,
        total: 1,
        drifted: 0,
      },
    ])
  })

  it.each([
    ['an empty Sanity read', () => fetchMock.mockResolvedValue([]), [d1()], {}],
    [
      'a failed Sanity read',
      () => fetchMock.mockRejectedValue(new Error(SECRET)),
      [d1()],
      {},
    ],
    ['an empty D1 read', () => fetchMock.mockResolvedValue([doc]), [], {}],
    [
      'a missing token',
      () => fetchMock.mockResolvedValue([doc]),
      [d1()],
      { SANITY_API_TOKEN_READ: '' },
    ],
  ])('reports %s as unknown, never in sync', async (_, arrange, rows, over) => {
    arrange()
    await expect(scheduled(envWith(rows, over))).resolves.toBeUndefined()
    expect(summary()).toBeUndefined()
    expect(events()).toEqual([
      expect.objectContaining({
        event: 'conference.parity.error',
        status: 'unknown',
      }),
    ])
    expect(logs.join()).not.toContain(SECRET)
  })

  // #1917: moved fields are D1-only with frozen Sanity copies (#2013).
  it('does not report an edit to a frozen moved field as drift', async () => {
    emit.mockReset()
    fetchMock.mockResolvedValue([doc])
    await scheduled(
      envWith([
        d1({ city: 'Oslo', title: 'Konf 2027', cfp_end_date: '2027-01-01' }),
      ]),
    )
    expect(summary()).toMatchObject({ status: 'in_sync', drifted: 0 })
    expect(emit).not.toHaveBeenCalled()
  })

  it.each([
    ['org_id', { org_id: 'o2' }],
    ['published', { published: 0 as const }],
    ['travel_support_budget', { travel_support_budget: 500 }],
    ['volunteer_slack_invite_url', { volunteer_slack_invite_url: 'https://x' }],
  ])('reports a dual-written column out of step: %s', async (col, over) => {
    fetchMock.mockResolvedValue([doc])
    await scheduled(envWith([d1(over)]))
    expect(events()[0]).toEqual({
      event: 'conference.parity.drift',
      conferenceId: 'c1',
      fields: [col],
    })
  })

  it('still reports a D1 row Sanity no longer has', async () => {
    fetchMock.mockResolvedValue([{ ...doc, _id: 'other' }])
    await scheduled(envWith([d1()]))
    expect(events()[0]).toEqual({
      event: 'conference.parity.drift',
      conferenceId: 'c1',
      fields: ['(missing in sanity)'],
    })
  })

  it('logs drift by column name, never by value', async () => {
    fetchMock.mockResolvedValue([{ ...doc, organizerAddress: SECRET }])
    await scheduled(envWith([d1({ contact_email: SECRET })]))
    expect(events()[0]).toEqual({
      event: 'conference.parity.drift',
      conferenceId: 'c1',
      fields: ['organizer_address', 'contact_email'],
    })
    expect(summary()).toMatchObject({ status: 'drift', drifted: 1 })
    expect(logs.join()).not.toContain(SECRET)
  })

  describe('Slack alert', () => {
    const post = vi.fn()
    beforeEach(() => {
      post.mockReset()
      vi.stubGlobal('fetch', post)
    })
    afterEach(() => vi.unstubAllGlobals())
    const url = { SLACK_CONFERENCE_PARITY_WEBHOOK_URL: 'https://hooks.test' }

    it('posts drift without values', async () => {
      post.mockResolvedValue(new Response('ok'))
      fetchMock.mockResolvedValue([doc])
      await scheduled(envWith([d1({ contact_email: SECRET })], url))
      const text = JSON.parse(post.mock.calls[0][1].body).text
      expect(text).toContain('c1: contact_email')
      expect(text).not.toContain(SECRET)
    })

    it('posts unknown on a failed read', async () => {
      post.mockResolvedValue(new Response('ok'))
      fetchMock.mockResolvedValue([])
      await scheduled(envWith([d1()], url))
      expect(JSON.parse(post.mock.calls[0][1].body).text).toContain('UNKNOWN')
    })

    it('stays silent when in sync or unset', async () => {
      fetchMock.mockResolvedValue([doc])
      await scheduled(envWith([d1()], url))
      await scheduled(envWith([d1({ city: 'x' })]))
      expect(post).not.toHaveBeenCalled()
    })

    it('a Slack failure does not fail the sweep or drop its log', async () => {
      post.mockRejectedValue(new Error('down'))
      fetchMock.mockResolvedValue([doc])
      await expect(
        scheduled(envWith([d1({ contact_email: 'x' })], url)),
      ).resolves.toBeUndefined()
      expect(summary()).toMatchObject({ status: 'drift' })
      expect(events().at(-1)).toMatchObject({
        event: 'conference.parity.alert_failed',
      })
    })
  })
})
