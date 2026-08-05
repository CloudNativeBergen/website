/**
 * @vitest-environment node
 *
 * TENANCY REGRESSIONS for the sponsor-CRM bulk-import paths (#823).
 *
 * `importAllHistoricSponsors` asked for "every conference that started before
 * mine" with NO organization predicate, then read every `sponsorForConference`
 * hanging off that set. In a shared multi-tenant dataset that is one tenant's
 * entire historic sponsor roster — company names, and via the copy path their
 * contacts and billing details — offered inside another tenant's import flow.
 * `copySponsorsFromPreviousYear` was worse in kind: its `sourceConferenceId` is
 * CLIENT INPUT used directly as the scope key, so a foreign conference id was
 * accepted verbatim.
 *
 * WHY THIS SUITE RUNS A REAL GROQ ENGINE (the `tenancy.exploits.test.ts`
 * precedent). Asserting `expect(query).toContain('organization._ref == $orgId')`
 * pins the DIFF, not the meaning: a predicate that keeps the substring and
 * inverts the semantics — an `|| defined(_id)` disjunct, a reordered `&&` that
 * escapes the root bracket — passes a substring harness while reading every
 * tenant. So the mock below evaluates the query text the code actually sent with
 * `groq-js` against a two-tenant fixture. Precedence, `in`, `->`, `order()` and
 * projection semantics are the engine's, not a re-implementation of them, and
 * the assertions are about which DOCUMENTS came back and which writes happened.
 *
 * SABOTAGE-VERIFIED. Deleting `organization._ref == $orgId` from the
 * previous-conferences read (the fix, one exact string) makes
 * "a sponsor of organization B is never offered to organization A" fail; the
 * happy-path tests stay green either way, which is what proves they are not the
 * thing doing the work.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse, evaluate } from 'groq-js'

type Doc = Record<string, unknown> & { _id: string; _type: string }

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  create: vi.fn(),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
  clientReadCached: { fetch: h.fetch },
  clientWrite: { fetch: h.fetch, create: h.create },
}))

import {
  importAllHistoricSponsors,
  copySponsorsFromPreviousYear,
} from './sanity'

const ORG_A = 'org-A'
const ORG_B = 'org-B'

const ref = (id: string) => ({ _type: 'reference', _ref: id })

/**
 * Two tenants, each with one past edition that has a closed-won sponsor, and one
 * upcoming edition for A to import into. The B rows are the ones that must never
 * be reachable from an A request.
 */
const dataset: Doc[] = [
  { _id: ORG_A, _type: 'organization', name: 'Org A' },
  { _id: ORG_B, _type: 'organization', name: 'Org B' },

  {
    _id: 'conf-a-2024',
    _type: 'conference',
    organization: ref(ORG_A),
    startDate: '2024-05-01',
    organizers: [ref('spk-a')],
  },
  {
    _id: 'conf-a-2025',
    _type: 'conference',
    organization: ref(ORG_A),
    startDate: '2025-05-01',
    organizers: [ref('spk-a')],
  },
  // B's edition starts BEFORE A's target, so a date-only filter reaches it.
  {
    _id: 'conf-b-2024',
    _type: 'conference',
    organization: ref(ORG_B),
    startDate: '2024-06-01',
    organizers: [ref('spk-b')],
  },

  { _id: 'sponsor-a1', _type: 'sponsor', name: 'Acme A' },
  { _id: 'sponsor-b1', _type: 'sponsor', name: 'Acme B' },

  {
    _id: 'sfc-a1',
    _type: 'sponsorForConference',
    conference: ref('conf-a-2024'),
    sponsor: ref('sponsor-a1'),
    status: 'closed-won',
    assignedTo: ref('spk-a'),
    contractCurrency: 'NOK',
    contactPersons: [
      { _key: 'c1', name: 'Ann A', email: 'ann@a.test', isPrimary: true },
    ],
    billing: { invoiceFormat: 'email', email: 'billing@a.test' },
  },
  {
    _id: 'sfc-b1',
    _type: 'sponsorForConference',
    conference: ref('conf-b-2024'),
    sponsor: ref('sponsor-b1'),
    status: 'closed-won',
    assignedTo: ref('spk-b'),
    contractCurrency: 'NOK',
    contactPersons: [
      { _key: 'c1', name: 'Bob B', email: 'bob@b.test', isPrimary: true },
    ],
    billing: { invoiceFormat: 'email', email: 'billing@b.test' },
  },
]

/** Every created document, in order. */
function createdDocs(): Array<Record<string, unknown>> {
  return h.create.mock.calls.map((c) => c[0] as Record<string, unknown>)
}

/** The `sponsor._ref` of every document the run created. */
function createdSponsorRefs(): string[] {
  return createdDocs().map(
    (d) => (d.sponsor as { _ref: string } | undefined)?._ref ?? '',
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // No branch on the query text: the engine decides what each query returns, so
  // nothing here can agree with a predicate that is wrong.
  h.fetch.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      await (await evaluate(parse(query), { dataset, params })).get(),
  )
  let n = 0
  h.create.mockImplementation(async (doc: Record<string, unknown>) => ({
    ...doc,
    _id: `created-${++n}`,
  }))
})

describe('importAllHistoricSponsors — historic import must not cross tenants', () => {
  it('imports THIS organization’s own history (the feature still works)', async () => {
    const { result, error } = await importAllHistoricSponsors({
      targetConferenceId: 'conf-a-2025',
      organizationId: ORG_A,
    })

    expect(error).toBeUndefined()
    expect(result).toMatchObject({
      created: 1,
      skipped: 0,
      taggedAsReturning: 1,
      // A's own past edition — and ONLY it.
      sourceConferencesCount: 1,
    })
    expect(createdSponsorRefs()).toEqual(['sponsor-a1'])
  })

  /**
   * THE BUG. `conf-b-2024` starts before A's target, so the date-only filter
   * swept it in and B's sponsor became an A import candidate. `sponsorForConference`
   * carries no organization key of its own, so the ONLY place this can be closed
   * is the conference read.
   */
  it('never offers organization B’s sponsors to organization A', async () => {
    await importAllHistoricSponsors({
      targetConferenceId: 'conf-a-2025',
      organizationId: ORG_A,
    })

    expect(createdSponsorRefs()).not.toContain('sponsor-b1')
    expect(h.create).toHaveBeenCalledTimes(1)
  })

  it('refuses a target conference belonging to another organization', async () => {
    const { result, error } = await importAllHistoricSponsors({
      targetConferenceId: 'conf-a-2025',
      organizationId: ORG_B,
    })

    expect(result).toBeUndefined()
    expect(error?.message).toBe('Target conference not found')
    expect(h.create).not.toHaveBeenCalled()
  })

  it('FAILS CLOSED on an unresolvable organization: no query, no write', async () => {
    const { result, error } = await importAllHistoricSponsors({
      targetConferenceId: 'conf-a-2025',
      organizationId: null,
    })

    expect(result).toBeUndefined()
    expect(error).toBeInstanceOf(Error)
    expect(h.fetch).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
  })
})

describe('copySponsorsFromPreviousYear — the SOURCE id is client input', () => {
  it('copies from this organization’s own edition (the feature still works)', async () => {
    const { result, error } = await copySponsorsFromPreviousYear({
      sourceConferenceId: 'conf-a-2024',
      targetConferenceId: 'conf-a-2025',
      organizationId: ORG_A,
    })

    expect(error).toBeUndefined()
    expect(result).toMatchObject({ created: 1, skipped: 0 })
    expect(createdSponsorRefs()).toEqual(['sponsor-a1'])
    // The copy carries contacts and billing — this is the payload that must not
    // be reachable across a tenant boundary.
    expect(createdDocs()[0]).toMatchObject({
      billing: { email: 'billing@a.test' },
    })
  })

  it('refuses a SOURCE conference belonging to another organization', async () => {
    const { result, error } = await copySponsorsFromPreviousYear({
      sourceConferenceId: 'conf-b-2024',
      targetConferenceId: 'conf-a-2025',
      organizationId: ORG_A,
    })

    expect(result).toBeUndefined()
    expect(error?.message).toBe('Source conference not found')
    expect(h.create).not.toHaveBeenCalled()
  })

  it('refuses a TARGET conference belonging to another organization', async () => {
    const { result, error } = await copySponsorsFromPreviousYear({
      sourceConferenceId: 'conf-b-2024',
      targetConferenceId: 'conf-b-2024',
      organizationId: ORG_A,
    })

    expect(result).toBeUndefined()
    expect(error).toBeInstanceOf(Error)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('FAILS CLOSED on an unresolvable organization: no query, no write', async () => {
    const { result, error } = await copySponsorsFromPreviousYear({
      sourceConferenceId: 'conf-a-2024',
      targetConferenceId: 'conf-a-2025',
      organizationId: null,
    })

    expect(result).toBeUndefined()
    expect(error).toBeInstanceOf(Error)
    expect(h.fetch).not.toHaveBeenCalled()
    expect(h.create).not.toHaveBeenCalled()
  })
})
