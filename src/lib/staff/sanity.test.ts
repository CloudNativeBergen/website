import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Cross-tenant deny + fail-closed tests for staff (#616/#18).
 *
 * `staff` carries an `organization` ref and renders on the PUBLIC `/staff/[role]`
 * pages. Before the scoping fix the query was unscoped, so every org's staff
 * leaked onto every tenant's public site. The fetch mock below honours the
 * injected `organization._ref == $orgId` predicate over a two-org store and
 * asserts a foreign org's staff is NOT returned — in BOTH directions.
 *
 * Boundary discipline (mock only external boundaries): the Sanity CLIENT and the
 * current-domain conference resolution (`getConferenceForCurrentDomain`, which
 * reads `headers()` + Sanity) are the boundaries mocked here. The real
 * `getOrganizationRefForCurrentConference` runs on top of the conference mock —
 * it is the unit under test for `getAllStaffMembers`. `getStaffMembers` now
 * takes a resolved `orgId` argument (resolved by the cached page from the
 * domain), so it is driven directly.
 *
 * Fail-closed (the critical property): when the tenant cannot be resolved
 * (`orgId` null), reads must return EMPTY and issue NO unscoped query — never
 * degrade to a global read.
 */

interface Doc {
  _id: string
  organization: { _ref: string }
  role: string
  name: string
  link: string
}

const STORE: Doc[] = [
  {
    _id: 's-A',
    organization: { _ref: 'org-A' },
    role: 'photographer',
    name: 'A Shooter',
    link: 'https://a.example/portfolio',
  },
  {
    _id: 's-B',
    organization: { _ref: 'org-B' },
    role: 'photographer',
    name: 'B Shooter',
    link: 'https://b.example/portfolio',
  },
]

function evalFetch(query: string, params: Record<string, unknown> = {}) {
  const scoped = query.includes('organization._ref == $orgId')
  let rows = STORE.filter((d) =>
    scoped ? d.organization._ref === params.orgId : true,
  )
  if (query.includes('role == $role'))
    rows = rows.filter((d) => d.role === params.role)
  return rows.map((d) => ({
    id: d._id,
    _id: d._id,
    name: d.name,
    role: d.role,
    link: d.link,
  }))
}

const fetchMock = vi.fn((query: string, params?: Record<string, unknown>) =>
  Promise.resolve(evalFetch(query, params)),
)
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: (q: string, p?: Record<string, unknown>) => fetchMock(q, p),
  },
}))

// External boundary: current-domain resolution reads headers() + Sanity. Mock
// it; the real getOrganizationRefForCurrentConference reads `.organization._ref`
// off whatever conference this returns.
const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    getConferenceMock(...args),
}))

import { getStaffMembers, getAllStaffMembers } from './sanity'

beforeEach(() => {
  vi.clearAllMocks()
  // Current tenant = org A.
  getConferenceMock.mockResolvedValue({
    conference: { _id: 'conf-A', organization: { _ref: 'org-A' } },
    error: null,
  })
})

describe('staff — public read scoping (#18)', () => {
  it('does not return a foreign org’s staff for a role', async () => {
    const { data } = await getStaffMembers('photographer', 'org-A')
    expect(data.map((m) => m.name)).toEqual(['A Shooter'])
    expect(data.some((m) => m.name === 'B Shooter')).toBe(false)
  })

  it('scopes the other direction (org B sees only its own)', async () => {
    const { data } = await getStaffMembers('photographer', 'org-B')
    expect(data.map((m) => m.name)).toEqual(['B Shooter'])
  })

  it('admin list is scoped to the current org', async () => {
    const all = await getAllStaffMembers()
    expect(all.map((m) => m._id)).toEqual(['s-A'])
  })

  it('admin list scopes the other direction too', async () => {
    getConferenceMock.mockResolvedValue({
      conference: { _id: 'conf-B', organization: { _ref: 'org-B' } },
      error: null,
    })
    const all = await getAllStaffMembers()
    expect(all.map((m) => m._id)).toEqual(['s-B'])
  })

  it('admin list projects `link` (regression: StaffManager edit form needs it)', async () => {
    const all = await getAllStaffMembers()
    expect(all[0].link).toBe('https://a.example/portfolio')
  })
})

describe('staff — fail closed when tenant is unresolvable (#18)', () => {
  it('getStaffMembers returns empty and issues NO query for a null org', async () => {
    const { data } = await getStaffMembers('photographer', null)
    expect(data).toEqual([])
    // The guard must bite: no unscoped global read may reach the client.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getAllStaffMembers returns empty and issues NO query for a null org', async () => {
    // Conference has no resolvable organization → org ref is null.
    getConferenceMock.mockResolvedValue({
      conference: { _id: 'conf-X', organization: null },
      error: null,
    })
    const all = await getAllStaffMembers()
    expect(all).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getAllStaffMembers fails closed when the conference lookup errors', async () => {
    getConferenceMock.mockResolvedValue({
      conference: null,
      error: new Error('no host'),
    })
    const all = await getAllStaffMembers()
    expect(all).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
