import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchMock = vi.fn()
const resolveCurrentOrgId = vi.fn<() => Promise<string | null>>()

vi.mock('next/server', () => ({ connection: async () => {} }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({
  getAuthSession: async () => ({ speaker: { _id: 'spk-1' } }),
}))
vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: async () => false,
  resolveCurrentOrgId: () => resolveCurrentOrgId(),
}))
vi.mock('@/lib/speaker/sanity', () => ({
  getSpeaker: async () => ({ speaker: { _id: 'spk-1' }, err: null }),
}))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
}))

import WorkshopDetailsPage from './page'

// Fake dataset. The domain serves org-a's 2026 edition; talk-2025 belongs to
// org-a's 2025 edition, talk-foreign to another org.
const talks: Record<string, { org: string; conf: string }> = {
  'talk-2025': { org: 'org-a', conf: 'conf-a-2025' },
  'talk-foreign': { org: 'org-b', conf: 'conf-b' },
}

// Evaluates the org clause the way GROQ would: present -> filter by $orgId,
// absent -> unscoped.
function fakeFetch(query: string, params: Record<string, string>) {
  if (query.includes('"talk"')) {
    const t = talks[params.workshopId]
    if (!t) return Promise.resolve(null)
    if (
      query.includes('conference->organization._ref == $orgId') &&
      params.orgId !== t.org
    )
      return Promise.resolve(null)
    return Promise.resolve({
      _id: params.workshopId,
      title: 'W',
      format: 'workshop_120',
      speakers: [{ _id: 'spk-1' }],
      conferenceId: t.conf,
    })
  }
  if (query.includes('"workshopSignup"')) return Promise.resolve([])
  return Promise.resolve(null)
}

const render = async (id: string) =>
  JSON.stringify(await WorkshopDetailsPage({ params: Promise.resolve({ id }) }))

describe('/cfp/workshop/[id] tenant scope', () => {
  beforeEach(() => {
    resolveCurrentOrgId.mockResolvedValue('org-a')
    fetchMock.mockImplementation(fakeFetch)
  })

  it('renders a same-org workshop from another edition', async () => {
    const out = await render('talk-2025')
    expect(out).not.toContain('Workshop Not Found')
    const signup = fetchMock.mock.calls.find(([q]) =>
      (q as string).includes('"workshopSignup"'),
    )
    expect(signup?.[1]).toMatchObject({ conferenceId: 'conf-a-2025' })
  })

  it('does not find a foreign-org workshop', async () => {
    const out = await render('talk-foreign')
    expect(out).toContain('Workshop Not Found')
    expect(
      fetchMock.mock.calls.some(([q]) =>
        (q as string).includes('"workshopSignup"'),
      ),
    ).toBe(false)
  })

  it('reads nothing when the domain resolves no org', async () => {
    resolveCurrentOrgId.mockResolvedValue(null)
    await render('talk-2025')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
