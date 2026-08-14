/**
 * @vitest-environment node
 *
 * E10 + #886: the sponsor company pickers must be tenant-scoped, and the
 * org-less bridge is now CLOSED.
 *
 * `getAllSponsors` / `searchSponsors` take a REQUIRED (nullable) orgId. A null
 * org FAILS CLOSED — it used to drop the clause entirely and read every tenant's
 * sponsors. The org predicate used to carry a `!defined(organization) ||`
 * disjunct for pre-044-backfill sponsors, which handed every org-less sponsor to
 * EVERY tenant's picker; the backfill is complete in production (0 of 98), so
 * #886 deleted it.
 *
 * WHY A REAL GROQ ENGINE. `expect(query).toContain('organization._ref ==
 * $orgId')` pins the DIFF, not the meaning — it passes unchanged with the
 * `!defined(organization) ||` disjunct back in place, which is the exact
 * regression this file now has to catch. So `clientWrite.fetch` evaluates the
 * query text the code actually sent with `groq-js` against a two-tenant fixture,
 * and the assertions are about WHICH SPONSORS came back.
 */

const h = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { fetch: h.fetch },
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefForCurrentConference: vi.fn(),
  organizationField: () => ({}),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse, evaluate } from 'groq-js'
import { getAllSponsors, searchSponsors } from './sanity'

type Doc = Record<string, unknown> & { _id: string; _type: string }

const ref = (id: string) => ({ _type: 'reference', _ref: id })

/**
 * Two tenants plus the legacy row the deleted bridge used to admit. `Acme Orphan`
 * is named to match the same `acme*` search prefix as both tenants' sponsors, so
 * the search case reaches it rather than being filtered out by the name match.
 */
const dataset: Doc[] = [
  {
    _id: 'sponsor-a',
    _type: 'sponsor',
    name: 'Acme A',
    organization: ref('org-A'),
  },
  {
    _id: 'sponsor-b',
    _type: 'sponsor',
    name: 'Acme B',
    organization: ref('org-B'),
  },
  // No `organization` — the pre-044 shape the bridge tolerated.
  { _id: 'sponsor-orphan', _type: 'sponsor', name: 'Acme Orphan' },
]

const names = (sponsors?: { name?: string }[]) =>
  (sponsors ?? []).map((s) => s.name)

beforeEach(() => {
  vi.clearAllMocks()
  h.fetch.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      await (await evaluate(parse(query), { dataset, params })).get(),
  )
})

describe('getAllSponsors — org scoping (E10) and the closed org-less bridge (#886)', () => {
  it('returns THIS org’s sponsors and neither the other tenant’s nor the org-less one', async () => {
    const { sponsors, error } = await getAllSponsors('org-A')

    expect(error).toBeUndefined()
    expect(names(sponsors)).toEqual(['Acme A'])
  })

  it('is symmetric: org B sees only its own', async () => {
    const { sponsors } = await getAllSponsors('org-B')
    expect(names(sponsors)).toEqual(['Acme B'])
  })

  it('binds the org as a parameter', async () => {
    await getAllSponsors('org-A')
    const [, params] = h.fetch.mock.calls[0]
    expect(params).toEqual({ orgId: 'org-A' })
  })

  // MUTATION CHECK: delete the `if (!orgId)` guard in `getAllSponsors` and this
  // test fails — the query goes out unscoped again.
  it('FAILS CLOSED on a null org: no query, no results', async () => {
    const { sponsors, error } = await getAllSponsors(null)
    expect(sponsors).toBeUndefined()
    expect(error).toBeInstanceOf(Error)
    expect(h.fetch).not.toHaveBeenCalled()
  })
})

describe('searchSponsors — org scoping (E10) and the closed org-less bridge (#886)', () => {
  it('applies the org clause alongside the name match', async () => {
    const { sponsors, error } = await searchSponsors('acme', 'org-A')

    expect(error).toBeUndefined()
    // All three documents match `acme*`; only one survives the tenant predicate.
    expect(names(sponsors)).toEqual(['Acme A'])
  })

  it('binds the search prefix and the org as parameters', async () => {
    await searchSponsors('acme', 'org-A')
    const [, params] = h.fetch.mock.calls[0]
    expect(params).toEqual({ searchQuery: 'acme*', orgId: 'org-A' })
  })

  // MUTATION CHECK: delete the `if (!orgId)` guard in `searchSponsors` and this
  // test fails.
  it('FAILS CLOSED on a null org: no query, no results', async () => {
    const { sponsors, error } = await searchSponsors('acme', null)
    expect(sponsors).toBeUndefined()
    expect(error).toBeInstanceOf(Error)
    expect(h.fetch).not.toHaveBeenCalled()
  })
})
