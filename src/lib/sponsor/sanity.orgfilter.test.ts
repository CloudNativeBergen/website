import { describe, it, expect, vi, beforeEach } from 'vitest'

// E10: the sponsor company pickers must be tenant-scoped. getAllSponsors /
// searchSponsors take an optional orgId that adds a coalesce org clause,
// tolerating org-less legacy sponsors; omitting it preserves the global catalog.
const fetchMock = vi.fn().mockResolvedValue([])
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: (...a: unknown[]) => fetchMock(...a) },
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefForCurrentConference: vi.fn(),
  organizationField: () => ({}),
}))

import { getAllSponsors, searchSponsors } from './sanity'

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockResolvedValue([])
})

describe('getAllSponsors — org scoping (E10)', () => {
  it('adds a coalesce org clause and binds the org when scoped', async () => {
    await getAllSponsors('org-A')
    const [query, params] = fetchMock.mock.calls[0]
    expect(query).toContain('!defined(organization)')
    expect(query).toContain('organization._ref == $orgId')
    expect(params).toEqual({ orgId: 'org-A' })
  })

  it('is unscoped (global catalog) when no org is provided', async () => {
    await getAllSponsors()
    const [query, params] = fetchMock.mock.calls[0]
    expect(query).not.toContain('organization._ref')
    expect(params).toEqual({})
  })
})

describe('searchSponsors — org scoping (E10)', () => {
  it('applies the org clause alongside the name match', async () => {
    await searchSponsors('acme', 'org-A')
    const [query, params] = fetchMock.mock.calls[0]
    expect(query).toContain('name match $searchQuery')
    expect(query).toContain('organization._ref == $orgId')
    expect(params).toEqual({ searchQuery: 'acme*', orgId: 'org-A' })
  })

  it('omits the org clause when unscoped', async () => {
    await searchSponsors('acme')
    const [query, params] = fetchMock.mock.calls[0]
    expect(query).not.toContain('organization._ref')
    expect(params).toEqual({ searchQuery: 'acme*' })
  })
})
