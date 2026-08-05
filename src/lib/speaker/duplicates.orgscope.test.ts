/**
 * @vitest-environment node
 *
 * TENANT SCOPING OF DUPLICATE DETECTION (#267 / #616).
 *
 * Detection reads every speaker document an organization can see, together with
 * their emails and login providers — so an unscoped version is a cross-tenant
 * dump of exactly the personal data the tenancy work exists to contain. And it
 * would be worse than useless in the product: an organizer cannot merge a
 * speaker who belongs to another organization (`requireExclusive`), so a
 * cross-tenant candidate is a row they can only stare at.
 *
 * WHY A REAL GROQ ENGINE, not a query-text assertion. Following
 * `src/server/tenancy.exploits.test.ts`: a mock that branches on
 * `query.includes('$orgId')` asserts that the diff is still present, not that
 * the predicate is still CORRECT — an inverted or widened filter keeps the
 * substring and passes. Here `clientReadUncached.fetch` evaluates the query text
 * the function actually sent with `groq-js` against a two-tenant document
 * fixture, so the semantics under test are the engine's.
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
import { getDuplicateSpeakerCandidateRecords } from './sanity'
import { findDuplicateSpeakerCandidates } from './duplicates'

const ORG_A = 'org-A'
const ORG_B = 'org-B'

type Doc = Record<string, unknown> & { _id: string; _type: string }

const ref = (id: string) => ({ _type: 'reference', _ref: id })

/**
 * Back `clientReadUncached.fetch` with a real GROQ evaluation over `dataset`.
 * No branching on the query text: there is nothing here that can agree with a
 * wrong predicate.
 */
function useDataset(dataset: Doc[]) {
  h.fetch.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      await (await evaluate(parse(query), { dataset, params })).get(),
  )
}

/**
 * Two tenants, each with its OWN pair of slug-colliding speaker documents.
 * Org A's pair is `shared-slug`; org B's is `b-shared-slug`.
 *
 * `spk-a3` is the pre-044 population: no `organizations[]` at all, visible to A
 * only through PARTICIPATION (a talk at one of A's conferences), and colliding
 * with nobody. `spk-a1` additionally has a talk at ORG B's conference, so the
 * org-scoped talk counts have something to exclude.
 */
const dataset: Doc[] = [
  { _id: ORG_A, _type: 'organization', name: 'A' },
  { _id: ORG_B, _type: 'organization', name: 'B' },
  { _id: 'conf-A', _type: 'conference', organization: ref(ORG_A) },
  { _id: 'conf-B', _type: 'conference', organization: ref(ORG_B) },

  {
    _id: 'spk-a1',
    _type: 'speaker',
    name: 'Ganesh Vasudevan',
    slug: { _type: 'slug', current: 'shared-slug' },
    email: 'ganesh.vasudev@gmail.com',
    providers: ['linkedin:2mtSWuh1kA'],
    _createdAt: '2026-05-05T00:00:00Z',
    organizations: [ref(ORG_A)],
  },
  {
    _id: 'spk-a2',
    _type: 'speaker',
    name: 'Ganesh Vasudevan',
    slug: { _type: 'slug', current: 'shared-slug' },
    email: 'ganesh.vasudevan@ericsson.com',
    providers: ['github:23187057'],
    _createdAt: '2026-06-15T00:00:00Z',
    organizations: [ref(ORG_A)],
  },
  {
    _id: 'spk-a3',
    _type: 'speaker',
    name: 'Legacy Participant',
    slug: { _type: 'slug', current: 'legacy-participant' },
    email: 'legacy@example.com',
    _createdAt: '2026-01-01T00:00:00Z',
  },

  {
    _id: 'spk-b1',
    _type: 'speaker',
    name: 'Other Tenant Person',
    slug: { _type: 'slug', current: 'b-shared-slug' },
    email: 'other@b.example',
    _createdAt: '2026-03-01T00:00:00Z',
    organizations: [ref(ORG_B)],
  },
  {
    _id: 'spk-b2',
    _type: 'speaker',
    name: 'Other Tenant Person',
    slug: { _type: 'slug', current: 'b-shared-slug' },
    email: 'other.dup@b.example',
    _createdAt: '2026-04-01T00:00:00Z',
    organizations: [ref(ORG_B)],
  },

  {
    _id: 'talk-a1',
    _type: 'talk',
    status: 'confirmed',
    conference: ref('conf-A'),
    speakers: [ref('spk-a1')],
  },
  {
    _id: 'talk-a3',
    _type: 'talk',
    status: 'submitted',
    conference: ref('conf-A'),
    speakers: [ref('spk-a3')],
  },
  // Org B's conference also has spk-a1 on a talk — an org-A count must not see it.
  {
    _id: 'talk-b1',
    _type: 'talk',
    status: 'confirmed',
    conference: ref('conf-B'),
    speakers: [ref('spk-a1')],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  useDataset(dataset)
})

describe('getDuplicateSpeakerCandidateRecords — tenant scoping', () => {
  it('returns only speakers belonging to the requested organization', async () => {
    const { records, err } = await getDuplicateSpeakerCandidateRecords(ORG_A)

    expect(err).toBeNull()
    expect(records.map((record) => record._id).sort()).toEqual([
      'spk-a1',
      'spk-a2',
      'spk-a3',
    ])
  })

  it('does NOT surface another tenant’s duplicate pair', async () => {
    // spk-b1/spk-b2 are a textbook slug collision — in org B. Detection for
    // org A must be blind to them, and detection for org B must find them.
    const { records } = await getDuplicateSpeakerCandidateRecords(ORG_A)
    const groups = findDuplicateSpeakerCandidates(records)

    expect(groups).toHaveLength(1)
    expect(groups[0].value).toBe('shared-slug')
    expect(
      groups.flatMap((group) => group.members.map((member) => member._id)),
    ).not.toContain('spk-b1')

    const forB = await getDuplicateSpeakerCandidateRecords(ORG_B)
    const bGroups = findDuplicateSpeakerCandidates(forB.records)
    expect(bGroups).toHaveLength(1)
    expect(bGroups[0].value).toBe('b-shared-slug')
    expect(bGroups[0].members.map((member) => member._id).sort()).toEqual([
      'spk-b1',
      'spk-b2',
    ])
  })

  it('includes the pre-backfill population reachable only by participation', async () => {
    // spk-a3 has no `organizations[]`, only a talk at one of A's conferences —
    // the same fallback arm `SPEAKER_ORG_FILTER` and
    // `requireSpeakerInCurrentOrg` use, so detection never shows a speaker the
    // organizer has no standing over, and never hides one they do.
    const { records } = await getDuplicateSpeakerCandidateRecords(ORG_A)
    expect(records.map((record) => record._id)).toContain('spk-a3')
  })

  it('counts talks within the requesting organization only', async () => {
    const { records } = await getDuplicateSpeakerCandidateRecords(ORG_A)
    const byId = new Map(records.map((record) => [record._id, record]))

    // spk-a1 has a confirmed talk at conf-A AND one at org B's conf-B. Only
    // A's counts — the number has to answer "what would WE lose by deleting
    // this document".
    expect(byId.get('spk-a1')?.talkCount).toBe(1)
    expect(byId.get('spk-a1')?.confirmedTalkCount).toBe(1)
    expect(byId.get('spk-a2')?.talkCount).toBe(0)
    expect(byId.get('spk-a2')?.confirmedTalkCount).toBe(0)
    // Submitted, not confirmed.
    expect(byId.get('spk-a3')?.talkCount).toBe(1)
    expect(byId.get('spk-a3')?.confirmedTalkCount).toBe(0)
  })

  it('projects the slug so a collision is detectable at all', async () => {
    const { records } = await getDuplicateSpeakerCandidateRecords(ORG_A)
    expect(records.find((record) => record._id === 'spk-a1')?.slug).toBe(
      'shared-slug',
    )
  })

  it('FAILS CLOSED with no organization: refuses instead of scanning globally', async () => {
    for (const orgId of [null, undefined, '']) {
      const { records, err } = await getDuplicateSpeakerCandidateRecords(orgId)
      expect(records).toEqual([])
      expect(err).toBeInstanceOf(Error)
    }
    // The decisive part: no query was ever sent. A degraded-to-global scan
    // would have listed every tenant's speakers.
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('returns an error rather than partial data when the read fails', async () => {
    h.fetch.mockRejectedValueOnce(new Error('sanity down'))
    const { records, err } = await getDuplicateSpeakerCandidateRecords(ORG_A)
    expect(records).toEqual([])
    expect(err).toBeInstanceOf(Error)
  })
})
