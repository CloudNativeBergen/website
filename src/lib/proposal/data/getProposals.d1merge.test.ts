/**
 * @vitest-environment node
 *
 * #1997: proposals carry D1-owned conference fields (title, dates) for
 * `apiRead` tenants; unflagged tenants never touch the gateway, and a
 * gateway failure keeps Sanity.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: {},
}))

import { getProposal, getProposals } from './sanity'

const conference = {
  _id: 'conf-test',
  title: 'Sanity Title',
  startDate: '2026-08-01',
  endDate: '2026-08-02',
  domains: ['test.example.com'],
}
const talk = (id: string) => ({ _id: id, conference: { ...conference } })

const d1 = () =>
  new Response(
    JSON.stringify({
      data: {
        conference: {
          id: 'conf-test',
          title: 'D1 Title',
          startDate: '2026-08-10',
          endDate: '2026-08-12',
        },
      },
    }),
  )

beforeEach(() => {
  vi.stubEnv('KONF_API_URL', 'https://api.example.com')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('proposal reads merge D1 conference fields', () => {
  it('flagged: title and dates come from D1, one gateway call per conference', async () => {
    vi.stubEnv('KONF_API_TENANTS', 'conf-test')
    const gw = vi.fn().mockImplementation(async () => d1())
    vi.stubGlobal('fetch', gw)
    fetchMock.mockResolvedValue([talk('a'), talk('b')])
    const { proposals } = await getProposals({ conferenceId: 'conf-test' })
    expect(
      proposals.map((p) => (p.conference as typeof conference).title),
    ).toEqual(['D1 Title', 'D1 Title'])
    expect((proposals[0].conference as typeof conference).endDate).toBe(
      '2026-08-12',
    )
    expect(gw).toHaveBeenCalledTimes(1)

    fetchMock.mockResolvedValue(talk('a'))
    const { proposal } = await getProposal({ id: 'a', speakerId: 's' })
    expect((proposal!.conference as typeof conference).title).toBe('D1 Title')
  })

  it('unflagged: Sanity values, gateway never called', async () => {
    vi.stubEnv('KONF_API_TENANTS', 'other-conf')
    const gw = vi.fn()
    vi.stubGlobal('fetch', gw)
    fetchMock.mockResolvedValue([talk('a')])
    const { proposals } = await getProposals({ conferenceId: 'conf-test' })
    fetchMock.mockResolvedValue(talk('a'))
    const { proposal } = await getProposal({ id: 'a', speakerId: 's' })
    expect(proposals[0].conference).toEqual(conference)
    expect(proposal!.conference).toEqual(conference)
    expect(gw).not.toHaveBeenCalled()
  })

  it('gateway failure: Sanity values', async () => {
    vi.stubEnv('KONF_API_TENANTS', 'conf-test')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('D1 down')))
    fetchMock.mockResolvedValue([talk('a')])
    const { proposals } = await getProposals({ conferenceId: 'conf-test' })
    expect(proposals[0].conference).toEqual(conference)
  })
})
