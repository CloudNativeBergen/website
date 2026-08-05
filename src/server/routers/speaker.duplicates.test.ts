/**
 * @vitest-environment node
 *
 * `speaker.admin.duplicateCandidates` — the FIND half of the merge tool (#267).
 *
 * Both reads it performs (the org-scoped corpus and the exclusivity probe) run
 * against a real `groq-js` evaluation of a two-tenant dataset, for the reason
 * spelled out in `src/server/tenancy.exploits.test.ts`: a mock that branches on
 * the query text asserts that the diff is still present, not that the predicate
 * is still correct.
 *
 * What is pinned here is the contract the UI depends on:
 *  - organizers only, and only their own organization's documents;
 *  - a candidate this org does not hold ALONE is reported as unmergeable rather
 *    than offered as an action `speaker.admin.merge` would refuse.
 */

const h = vi.hoisted(() => ({ fetch: vi.fn() }))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
  clientReadCached: { fetch: h.fetch },
  clientWrite: {
    fetch: h.fetch,
    patch: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
  },
  speakerImageUrl: vi.fn(),
}))
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }))
vi.mock('@/lib/conference/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: 'conf-A',
      organization: { _type: 'reference', _ref: 'org-A' },
    },
    domain: 'a.test',
    error: null,
  }),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse, evaluate } from 'groq-js'
import type { Context } from '@/server/trpc'
import { speakerRouter } from './speaker'

const ORG_A = 'org-A'
const ORG_B = 'org-B'

type Doc = Record<string, unknown> & { _id: string; _type: string }

const ref = (id: string) => ({ _type: 'reference', _ref: id })

function useDataset(dataset: Doc[]) {
  h.fetch.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      await (await evaluate(parse(query), { dataset, params })).get(),
  )
}

function makeCaller(opts: { isOrganizer: boolean }) {
  const speaker = {
    _id: 'admin-1',
    name: 'Admin',
    isOrganizer: opts.isOrganizer,
    organizerOrgIds: opts.isOrganizer ? [ORG_A] : [],
  }
  return speakerRouter.createCaller({
    session: { speaker, user: { name: 'Admin' } },
    speaker,
  } as unknown as Context)
}

/**
 * Org A holds two slug-colliding documents outright. Org A and org B BOTH have
 * standing over the `shared-person` pair, so neither of those may be deleted
 * from here.
 */
const dataset: Doc[] = [
  { _id: ORG_A, _type: 'organization', name: 'A' },
  { _id: ORG_B, _type: 'organization', name: 'B' },
  { _id: 'conf-A', _type: 'conference', organization: ref(ORG_A) },
  { _id: 'conf-B', _type: 'conference', organization: ref(ORG_B) },

  {
    _id: 'spk-keep',
    _type: 'speaker',
    name: 'Ganesh Vasudevan',
    slug: { _type: 'slug', current: 'ganesh-vasudevan' },
    email: 'ganesh.vasudev@gmail.com',
    providers: ['linkedin:2mtSWuh1kA'],
    _createdAt: '2026-05-05T00:00:00Z',
    organizations: [ref(ORG_A)],
  },
  {
    _id: 'spk-dupe',
    _type: 'speaker',
    name: 'Ganesh Vasudevan',
    slug: { _type: 'slug', current: 'ganesh-vasudevan' },
    email: 'ganesh.vasudevan@ericsson.com',
    providers: ['github:23187057'],
    _createdAt: '2026-06-15T00:00:00Z',
    organizations: [ref(ORG_A)],
  },
  {
    _id: 'talk-keep',
    _type: 'talk',
    status: 'confirmed',
    conference: ref('conf-A'),
    speakers: [ref('spk-keep')],
  },

  // A duplicate pair that BOTH organizations hold — unmergeable from here.
  {
    _id: 'spk-shared-1',
    _type: 'speaker',
    name: 'Shared Person',
    slug: { _type: 'slug', current: 'shared-person' },
    email: 'shared@example.com',
    _createdAt: '2026-01-01T00:00:00Z',
    organizations: [ref(ORG_A), ref(ORG_B)],
  },
  {
    _id: 'spk-shared-2',
    _type: 'speaker',
    name: 'Shared Person',
    slug: { _type: 'slug', current: 'shared-person' },
    email: 'shared.dup@example.com',
    _createdAt: '2026-02-01T00:00:00Z',
    organizations: [ref(ORG_A), ref(ORG_B)],
  },

  // A pair held only by org A, but one of them is referenced by a document
  // whose tenant cannot be established (the pre-044 population, #731).
  {
    _id: 'spk-orphan-1',
    _type: 'speaker',
    name: 'Orphan Ref Person',
    slug: { _type: 'slug', current: 'orphan-person' },
    _createdAt: '2026-01-01T00:00:00Z',
    organizations: [ref(ORG_A)],
  },
  {
    _id: 'spk-orphan-2',
    _type: 'speaker',
    name: 'Orphan Ref Person',
    slug: { _type: 'slug', current: 'orphan-person' },
    _createdAt: '2026-02-01T00:00:00Z',
    organizations: [ref(ORG_A)],
  },
  { _id: 'conf-orphan', _type: 'conference' },
  {
    _id: 'talk-orphan',
    _type: 'talk',
    status: 'submitted',
    conference: ref('conf-orphan'),
    speakers: [ref('spk-orphan-2')],
  },

  // Another tenant's own duplicate pair. Never visible to org A.
  {
    _id: 'spk-b1',
    _type: 'speaker',
    name: 'B Person',
    slug: { _type: 'slug', current: 'b-person' },
    _createdAt: '2026-01-01T00:00:00Z',
    organizations: [ref(ORG_B)],
  },
  {
    _id: 'spk-b2',
    _type: 'speaker',
    name: 'B Person',
    slug: { _type: 'slug', current: 'b-person' },
    _createdAt: '2026-02-01T00:00:00Z',
    organizations: [ref(ORG_B)],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  useDataset(dataset)
})

describe('speaker.admin.duplicateCandidates', () => {
  it('rejects a non-organizer', async () => {
    await expect(
      makeCaller({ isOrganizer: false }).admin.duplicateCandidates(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('finds the slug collision and suggests the confirmed-talk document', async () => {
    const result = await makeCaller({
      isOrganizer: true,
    }).admin.duplicateCandidates()

    const collision = result.groups.find(
      (group) => group.value === 'ganesh-vasudevan',
    )
    expect(collision).toBeDefined()
    expect(collision!.confidence).toBe('certain')
    expect(collision!.suggestedSurvivorId).toBe('spk-keep')
    expect(collision!.survivorReason).toBe('confirmed-talks')
    // The duplicate is exclusively ours, so it may be merged away.
    expect(
      collision!.members.find((member) => member._id === 'spk-dupe')
        ?.mergeBlockedReason,
    ).toBeNull()
  })

  it('never surfaces another tenant’s duplicates', async () => {
    const result = await makeCaller({
      isOrganizer: true,
    }).admin.duplicateCandidates()

    const ids = result.groups.flatMap((group) =>
      group.members.map((member) => member._id),
    )
    expect(ids).not.toContain('spk-b1')
    expect(ids).not.toContain('spk-b2')
    expect(result.scannedCount).toBe(6)
  })

  it('reports an UNATTRIBUTABLE referencing document as a block, not a pass', () => {
    // The #731 fail-open: in a pre-044 dataset the membership and participation
    // arms both go blind, and only the reference-graph arm — which counts a
    // document it cannot attribute as foreign — still refuses. The panel has to
    // show that refusal rather than a button.
    return makeCaller({ isOrganizer: true })
      .admin.duplicateCandidates()
      .then((result) => {
        const orphan = result.groups.find(
          (group) => group.value === 'orphan-person',
        )!
        expect(orphan).toBeDefined()
        expect(
          orphan.members.find((member) => member._id === 'spk-orphan-2')
            ?.mergeBlockedReason,
        ).toBe('foreign-references')
        // Its sibling carries no such reference and stays mergeable.
        expect(
          orphan.members.find((member) => member._id === 'spk-orphan-1')
            ?.mergeBlockedReason,
        ).toBeNull()
      })
  })

  it('reports a cross-tenant candidate as UNMERGEABLE instead of offering it', async () => {
    // `speaker.admin.merge` requires the loser to be exclusive to this org, so
    // offering a merge button here would produce a BAD_REQUEST on click.
    const result = await makeCaller({
      isOrganizer: true,
    }).admin.duplicateCandidates()

    const shared = result.groups.find(
      (group) => group.value === 'shared-person',
    )!
    expect(shared).toBeDefined()
    for (const member of shared.members) {
      expect(member.mergeBlockedReason).toBe('other-organization')
    }
  })

  /**
   * THE ONE DELIBERATE TEXT ASSERTION, for the same reason and with the same
   * scope as the one in `src/server/tenancy.exploits.test.ts`: `groq-js`
   * evaluates `null != $param` as `true`, while the Sanity backend drops it as
   * unknown. The `!defined(...) ||` arm exists purely for that backend
   * behaviour, so the engine above cannot observe its removal — the test right
   * before this one keeps passing without it. Do not add a second text
   * assertion; everything else here is semantic.
   */
  it('keeps the !defined arm that makes an unattributable document foreign', async () => {
    await makeCaller({ isOrganizer: true }).admin.duplicateCandidates()

    const probe = h.fetch.mock.calls
      .map((call) => call[0] as string)
      .find((query) => query.includes('foreignRefCount'))

    expect(probe).toBeDefined()
    expect(probe).toContain(
      '!defined(coalesce(organization._ref, conference->organization._ref)) ||',
    )
  })

  it('fails closed when the exclusivity probe cannot be read', async () => {
    const realFetch = h.fetch.getMockImplementation()!
    h.fetch.mockImplementation(async (query: string, params) => {
      if (query.includes('foreignRefCount')) throw new Error('probe down')
      return realFetch(query, params)
    })

    const result = await makeCaller({
      isOrganizer: true,
    }).admin.duplicateCandidates()

    expect(result.groups.length).toBeGreaterThan(0)
    for (const group of result.groups) {
      for (const member of group.members) {
        expect(member.mergeBlockedReason).toBe('unknown')
      }
    }
  })
})
