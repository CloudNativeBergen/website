import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Cross-tenant deny test for staff (#616/#18).
 *
 * `staff` carries an `organization` ref and renders on the PUBLIC `/staff/[role]`
 * pages. Before the scoping fix the query was unscoped, so every org's staff
 * leaked onto every tenant's public site. The fetch mock below honours the
 * injected `organization._ref == $orgId` predicate over a two-org store and
 * asserts a foreign org's staff is NOT returned.
 */

interface Doc {
  _id: string
  organization: { _ref: string }
  role: string
  name: string
}

const STORE: Doc[] = [
  {
    _id: 's-A',
    organization: { _ref: 'org-A' },
    role: 'photographer',
    name: 'A Shooter',
  },
  {
    _id: 's-B',
    organization: { _ref: 'org-B' },
    role: 'photographer',
    name: 'B Shooter',
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

const getOrgMock = vi.fn<() => Promise<string | null>>()
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefForCurrentConference: () => getOrgMock(),
}))

import { getStaffMembers, getAllStaffMembers } from './sanity'

beforeEach(() => {
  vi.clearAllMocks()
  getOrgMock.mockResolvedValue('org-A') // current tenant = org A
})

describe('staff — public read scoping (#18)', () => {
  it('does not return a foreign org’s staff for a role', async () => {
    const { data } = await getStaffMembers('photographer')
    expect(data.map((m) => m.name)).toEqual(['A Shooter'])
    expect(data.some((m) => m.name === 'B Shooter')).toBe(false)
  })

  it('admin list is scoped to the current org too', async () => {
    const all = await getAllStaffMembers()
    expect(all.map((m) => m._id)).toEqual(['s-A'])
  })

  it('scopes the other direction (org B sees only its own)', async () => {
    getOrgMock.mockResolvedValue('org-B')
    const { data } = await getStaffMembers('photographer')
    expect(data.map((m) => m.name)).toEqual(['B Shooter'])
  })
})
