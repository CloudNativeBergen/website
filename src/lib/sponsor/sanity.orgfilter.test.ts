import { describe, it, expect, vi, beforeEach } from 'vitest'

// E10: the sponsor company pickers must be tenant-scoped. getAllSponsors /
// searchSponsors take a REQUIRED (nullable) orgId that adds a coalesce org
// clause, tolerating org-less legacy sponsors. A null org now FAILS CLOSED —
// it used to drop the clause entirely and read every tenant's sponsors.
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

  // MUTATION CHECK: delete the `if (!orgId)` guard in `getAllSponsors` and this
  // test fails — the query goes out unscoped again.
  it('FAILS CLOSED on a null org: no query, no results', async () => {
    const { sponsors, error } = await getAllSponsors(null)
    expect(sponsors).toBeUndefined()
    expect(error).toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
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

  // MUTATION CHECK: delete the `if (!orgId)` guard in `searchSponsors` and this
  // test fails.
  it('FAILS CLOSED on a null org: no query, no results', async () => {
    const { sponsors, error } = await searchSponsors('acme', null)
    expect(sponsors).toBeUndefined()
    expect(error).toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
