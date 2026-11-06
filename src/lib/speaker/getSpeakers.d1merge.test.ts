/**
 * @vitest-environment node
 *
 * #1997: a speaker's proposals carry D1-owned conference fields for `apiRead`
 * tenants; unflagged tenants never touch the gateway, and a gateway failure
 * keeps Sanity.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
vi.mock('@/lib/conference/konf-api', async (orig) => ({
  ...(await orig<object>()),
  rolloutFlags: (await import('../../../__tests__/helpers/rolloutFlags'))
    .fakeRolloutFlags,
}))
import { flagTenants } from '../../../__tests__/helpers/rolloutFlags'

const h = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
  clientReadCached: { fetch: h.fetch },
  clientWrite: { fetch: h.fetch },
  clientRead: { fetch: h.fetch },
  speakerImageUrl: vi.fn(),
}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/profile/github', () => ({ verifiedEmails: vi.fn() }))

import { getSpeakersUncached } from './sanity'

const conference = {
  _id: 'conf-test',
  title: 'Sanity Title',
  startDate: '2026-08-01',
  endDate: '2026-08-02',
  domains: ['test.example.com'],
}
const rows = () => [
  { _id: 's1', proposals: [{ _id: 'p1', conference: { ...conference } }] },
  { _id: 's2' },
  { _id: 's3', proposals: [{ _id: 'p2', conference: { ...conference } }] },
]
const d1 = () =>
  new Response(
    JSON.stringify({
      data: { conference: { id: 'conf-test', title: 'D1 Title' } },
    }),
  )
const titles = (s: Awaited<ReturnType<typeof getSpeakersUncached>>) =>
  s.speakers.map((x) =>
    x.proposals?.map((p) => (p.conference as typeof conference).title),
  )

beforeEach(() => {
  vi.stubEnv('KONF_API_URL', 'https://api.example.com')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  h.fetch.mockResolvedValue(rows())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('getSpeakers merges D1 conference fields into proposals', () => {
  it('flagged: D1 title, kept per speaker, one gateway call', async () => {
    flagTenants('apiRead', 'conf-test')
    const gw = vi.fn().mockImplementation(async () => d1())
    vi.stubGlobal('fetch', gw)
    const res = await getSpeakersUncached('conf-test')
    expect(res.err).toBeNull()
    expect(titles(res)).toEqual([['D1 Title'], undefined, ['D1 Title']])
    expect(res.speakers.map((s) => s.proposals?.map((p) => p._id))).toEqual([
      ['p1'],
      undefined,
      ['p2'],
    ])
    expect(gw).toHaveBeenCalledTimes(1)
  })

  it('unflagged: Sanity values, gateway never called', async () => {
    flagTenants('apiRead', 'other-conf')
    const gw = vi.fn()
    vi.stubGlobal('fetch', gw)
    const res = await getSpeakersUncached('conf-test')
    expect(res.speakers).toEqual(rows())
    expect(gw).not.toHaveBeenCalled()
  })

  it('gateway failure: Sanity values', async () => {
    flagTenants('apiRead', 'conf-test')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('D1 down')))
    const res = await getSpeakersUncached('conf-test')
    expect(res.speakers).toEqual(rows())
  })
})
