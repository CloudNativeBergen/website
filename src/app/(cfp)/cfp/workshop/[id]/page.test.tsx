import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
const getConferenceForCurrentDomain = vi.fn()

vi.mock('next/server', () => ({ connection: async () => {} }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  getAuthSession: async () => ({ speaker: { _id: 'spk-1' } }),
}))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: async () => false,
}))
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeaker: async () => ({ speaker: { _id: 'spk-1' }, err: null }),
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: () => getConferenceForCurrentDomain(),
}))

import WorkshopDetailsPage from './page'

const render = () =>
  WorkshopDetailsPage({ params: Promise.resolve({ id: 'talk-1' }) })

describe('/cfp/workshop/[id] tenant scope', () => {
  beforeEach(() => {
    fetchMock.mockResolvedValue(null)
    getConferenceForCurrentDomain.mockResolvedValue({
      conference: { _id: 'conf-a' },
    })
  })

  it('binds the talk and signup reads to the domain conference', async () => {
    fetchMock.mockImplementation((query: string) =>
      Promise.resolve(
        query.includes('"talk"')
          ? {
              _id: 'talk-1',
              title: 'W',
              format: 'workshop_120',
              speakers: [{ _id: 'spk-1' }],
            }
          : query.includes('"workshopSignup"')
            ? []
            : null,
      ),
    )
    await render()
    const reads = fetchMock.mock.calls.filter(([q]) =>
      /"talk"|"workshopSignup"/.test(q as string),
    )
    expect(reads).toHaveLength(2)
    for (const [query, params] of reads) {
      expect(query).toContain('conference._ref == $conferenceId')
      expect(params).toMatchObject({ conferenceId: 'conf-a' })
    }
  })

  it('reads nothing when the domain resolves no conference', async () => {
    getConferenceForCurrentDomain.mockResolvedValue({ conference: null })
    await render()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
