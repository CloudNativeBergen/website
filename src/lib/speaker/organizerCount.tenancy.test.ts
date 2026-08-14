/**
 * @vitest-environment node
 *
 * ORGANIZER COUNT MUST NOT BE DATASET-WIDE (#886, the unfixed sibling of
 * #723/#728).
 *
 * `getOrganizerCount()` ran `count(*[_type == "conference"].organizers[]._ref)`
 * — every organizer of every conference — and the number is not cosmetic: it is
 * the organizer half of free-ticket allocation on `/admin/tickets`. With a
 * second tenant in the shared dataset, one conference's ticket budget silently
 * absorbs the other's headcount. Nothing errors; the total is just wrong.
 *
 * WHY A REAL GROQ ENGINE, not a query-text assertion (the
 * `duplicates.orgscope.test.ts` / `tenancy.exploits.test.ts` precedent). A
 * `toContain('$conferenceId')` harness pins the DIFF, not the meaning: a
 * predicate that keeps the substring and widens it (`_id == $conferenceId ||
 * defined(_id)`, a reordered `&&` that escapes the root bracket) passes while
 * counting the whole dataset. Here `clientReadUncached.fetch` evaluates the
 * query text the function ACTUALLY sent with `groq-js` against a two-tenant
 * fixture, so the assertions are about the NUMBER that comes back.
 *
 * The decisive case is therefore the two-conference one: a single-conference
 * fixture returns the same number whether or not the fix is present, and proves
 * nothing at all.
 */

const h = vi.hoisted(() => ({ fetch: vi.fn() }))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
  clientReadCached: { fetch: h.fetch },
  clientWrite: { fetch: h.fetch },
  speakerImageUrl: vi.fn(),
}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/profile/github', () => ({ verifiedEmails: vi.fn() }))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefForCurrentConference: vi.fn().mockResolvedValue(null),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse, evaluate } from 'groq-js'
import { getOrganizerCount } from './sanity'

type Doc = Record<string, unknown> & { _id: string; _type: string }

const ref = (id: string) => ({ _type: 'reference', _ref: id })

/**
 * Two tenants, deliberately LOPSIDED so no two answers collide numerically:
 * conference A has 2 organizers, conference B has 5, and A's org has a second
 * edition with 3 more. Dataset-wide the count is 10 — a value no correct
 * per-conference answer can produce, so a passing assertion cannot be an
 * accident of the fixture.
 */
const dataset: Doc[] = [
  { _id: 'org-A', _type: 'organization', name: 'Org A' },
  { _id: 'org-B', _type: 'organization', name: 'Org B' },

  {
    _id: 'conf-a-2026',
    _type: 'conference',
    title: 'Conf A 2026',
    organization: ref('org-A'),
    organizers: [ref('spk-a1'), ref('spk-a2')],
  },
  {
    _id: 'conf-a-2025',
    _type: 'conference',
    title: 'Conf A 2025',
    organization: ref('org-A'),
    organizers: [ref('spk-a1'), ref('spk-a2'), ref('spk-a3')],
  },
  {
    _id: 'conf-b-2026',
    _type: 'conference',
    title: 'Conf B 2026',
    organization: ref('org-B'),
    organizers: [
      ref('spk-b1'),
      ref('spk-b2'),
      ref('spk-b3'),
      ref('spk-b4'),
      ref('spk-b5'),
    ],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  // No branching on the query text: there is nothing here that can agree with a
  // wrong predicate.
  h.fetch.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      await (await evaluate(parse(query), { dataset, params })).get(),
  )
})

describe('getOrganizerCount — must count ONE conference, not the dataset', () => {
  it('counts only conference A’s organizers while tenant B is in the dataset', async () => {
    const { count, err } = await getOrganizerCount('conf-a-2026')

    expect(err).toBeNull()
    expect(count).toBe(2)
    // The number the unscoped query produced, spelled out so the regression is
    // named rather than merely excluded.
    expect(count).not.toBe(10)
  })

  it('counts only conference B’s organizers — the same call, the other tenant', async () => {
    const { count, err } = await getOrganizerCount('conf-b-2026')

    expect(err).toBeNull()
    expect(count).toBe(5)
  })

  it('does not spill the other EDITION of the same org', async () => {
    // org-A owns both editions, so an org-scoped fix would answer 5 here. The
    // free-ticket budget belongs to one event, so 2 is the only right answer.
    const { count } = await getOrganizerCount('conf-a-2026')
    expect(count).toBe(2)
  })

  it('returns 0 for a conference id that is not in the dataset', async () => {
    const { count, err } = await getOrganizerCount('conf-does-not-exist')
    expect(err).toBeNull()
    expect(count).toBe(0)
  })

  // MUTATION CHECK: delete the `if (!conferenceId)` guard and this fails — the
  // query goes out and counts every tenant's organizers again.
  it('FAILS CLOSED on an unresolvable conference: no query is issued', async () => {
    const { count, err } = await getOrganizerCount(null)

    expect(count).toBe(0)
    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toContain('without a resolved conference')
    // Guard BEFORE fetch: refusing after reading would still have read.
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('binds the conference id as a PARAMETER rather than interpolating it', async () => {
    await getOrganizerCount('conf-a-2026')

    const [query, params] = h.fetch.mock.calls[0]
    expect(params).toEqual({ conferenceId: 'conf-a-2026' })
    expect(query).not.toContain('conf-a-2026')
  })
})
