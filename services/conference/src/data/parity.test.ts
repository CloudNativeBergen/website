import { afterEach, describe, expect, it, vi } from 'vitest'
import { mapBackfill, type SanityConference } from '../../scripts/backfill'
import { findDrift, scheduled } from './parity'

const doc: SanityConference = {
  _id: 'c1',
  orgId: 'o1',
  title: 'Konf',
  city: 'Bergen',
  tagline: '',
  socialLinks: ['https://x.test'],
}
// The D1 row as the site writes it: '' stored as null, links as JSON text.
const d1 = (over = {}) => ({
  ...mapBackfill([doc], new Set(['c1'])).rows[0],
  tagline: null,
  ...over,
})

const fetchMock = vi.fn()
vi.mock('@sanity/client', () => ({
  createClient: () => ({ fetch: fetchMock }),
}))

describe('findDrift', () => {
  it('is clean when D1 equals Sanity after normalisation', () => {
    expect(findDrift([d1()], [doc])).toEqual([])
  })

  it('reports the drifting fields by value', () => {
    expect(
      findDrift([d1({ city: 'Oslo', social_links: '[]' })], [doc]),
    ).toEqual([{ conferenceId: 'c1', fields: ['city', 'socialLinks'] }])
  })

  it('reports a row Sanity no longer has, or a moved org', () => {
    expect(findDrift([d1()], [])).toEqual([
      { conferenceId: 'c1', fields: ['(conference)'] },
    ])
    expect(findDrift([d1({ org_id: 'o2' })], [doc])).toEqual([
      { conferenceId: 'c1', fields: ['orgId'] },
    ])
  })
})

describe('scheduled', () => {
  afterEach(() => vi.restoreAllMocks())

  it('logs one drift event and the sweep summary', async () => {
    fetchMock.mockResolvedValue([doc])
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const all = vi.fn().mockResolvedValue({ results: [d1({ title: 'Old' })] })
    const env = {
      DB: { prepare: () => ({ all }) } as unknown as D1Database,
      SANITY_PROJECT_ID: 'p',
      SANITY_DATASET: 'd',
      SANITY_API_TOKEN_READ: 't',
    }
    await scheduled(env)
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), { ids: ['c1'] })
    expect(error.mock.calls.map((c) => JSON.parse(c[0]))).toEqual([
      { event: 'conference.parity.drift', conferenceId: 'c1', fields: ['title'] },
    ])
    expect(JSON.parse(log.mock.calls[0][0])).toEqual({
      event: 'conference.parity.sweep',
      checked: 1,
      drifted: 1,
    })
  })
})
