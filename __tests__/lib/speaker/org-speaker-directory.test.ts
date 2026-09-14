/**
 * @vitest-environment node
 *
 * `getOrgSpeakerDirectory` — the corpus behind the co-speaker picker
 * (`speaker.admin.list`), exercised against the REAL GROQ engine (`groq-js`)
 * over an in-memory dataset. A mocked query would prove nothing about what the
 * query text means, and all three properties under test are properties of the
 * text:
 *
 *   1. it includes a speaker of this org whose only talks are REJECTED — the
 *      bug this function exists to fix, and the ordinary case (someone who
 *      submitted their own talk and was turned down);
 *   2. it is ORG-SCOPED on membership ∨ participation, so another tenant's
 *      speakers never appear;
 *   3. it FAILS CLOSED — an unresolvable org returns nothing, and never runs
 *      the query at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluate, parse } from 'groq-js'
import { clientReadUncached } from '@/lib/sanity/client'
import { getOrgSpeakerDirectory } from '@/lib/speaker/sanity'

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn() },
  clientWrite: { create: vi.fn(), patch: vi.fn(), transaction: vi.fn() },
  clientReadCached: { fetch: vi.fn() },
}))

const THIS_ORG = 'org-this'
const OTHER_ORG = 'org-other'

const dataset = [
  {
    _id: 'conf-this',
    _type: 'conference',
    organization: { _type: 'reference', _ref: THIS_ORG },
  },
  {
    _id: 'conf-other',
    _type: 'conference',
    organization: { _type: 'reference', _ref: OTHER_ORG },
  },

  // THE BUG. A member of this org whose every talk was rejected. The old corpus
  // (`getSpeakers` with [submitted, accepted, confirmed]) dropped him, so the
  // picker could not find him and the duplicate probe's "add that existing
  // profile instead" was advice nobody could follow.
  {
    _id: 'speaker-rejected-only',
    _type: 'speaker',
    name: 'Josh Rejected',
    title: 'Platform Engineer',
    email: 'josh@example.com',
    imageURL: 'https://example.com/josh.png',
    slug: { _type: 'slug', current: 'josh-rejected' },
    organizations: [{ _type: 'reference', _ref: THIS_ORG }],
    // Fields an organizer-facing list must NOT carry.
    knownEmails: ['josh.old@example.com'],
    providers: ['github:99'],
  },
  {
    _id: 'talk-rejected-a',
    _type: 'talk',
    status: 'rejected',
    conference: { _type: 'reference', _ref: 'conf-this' },
    speakers: [{ _type: 'reference', _ref: 'speaker-rejected-only' }],
  },

  // No membership ref at all — standing comes only from a talk at one of this
  // org's conferences (the pre-backfill population).
  {
    _id: 'speaker-participant',
    _type: 'speaker',
    name: 'Ada Participant',
    email: 'ada@example.com',
  },
  {
    _id: 'talk-draft',
    _type: 'talk',
    status: 'draft',
    conference: { _type: 'reference', _ref: 'conf-this' },
    speakers: [{ _type: 'reference', _ref: 'speaker-participant' }],
  },

  // Another tenant: a member of OTHER_ORG, with a talk at OTHER_ORG's
  // conference. Neither clause of the predicate may reach him.
  {
    _id: 'speaker-foreign',
    _type: 'speaker',
    name: 'Foreign Tenant Person',
    email: 'foreign@example.com',
    organizations: [{ _type: 'reference', _ref: OTHER_ORG }],
  },
  {
    _id: 'talk-foreign',
    _type: 'talk',
    status: 'confirmed',
    conference: { _type: 'reference', _ref: 'conf-other' },
    speakers: [{ _type: 'reference', _ref: 'speaker-foreign' }],
  },

  // No org standing of any kind.
  {
    _id: 'speaker-orphan',
    _type: 'speaker',
    name: 'Orphan No Org',
    email: 'orphan@example.com',
  },
]

function useRealGroq() {
  vi.mocked(clientReadUncached.fetch).mockImplementation((async (
    query: string,
    params: Record<string, unknown>,
  ) => {
    const value = await evaluate(parse(query), { dataset, params })
    return value.get()
  }) as never)
}

const names = async (orgId: string | null | undefined) =>
  (await getOrgSpeakerDirectory(orgId)).speakers.map((s) => s.name)

describe('getOrgSpeakerDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRealGroq()
  })

  // LOAD-BEARING. This is the reported bug.
  it('returns a speaker of this org whose only talks are rejected', async () => {
    expect(await names(THIS_ORG)).toContain('Josh Rejected')
  })

  it('counts participation as standing, not just membership', async () => {
    expect(await names(THIS_ORG)).toContain('Ada Participant')
  })

  // LOAD-BEARING. Widening a corpus is how a tenant leak happens.
  it('never returns another org’s speakers', async () => {
    const found = await names(THIS_ORG)
    expect(found).not.toContain('Foreign Tenant Person')
    expect(found).not.toContain('Orphan No Org')
    expect(found).toEqual(['Ada Participant', 'Josh Rejected'])
  })

  it('returns the other org only its own speakers', async () => {
    expect(await names(OTHER_ORG)).toEqual(['Foreign Tenant Person'])
  })

  // GUARD BEFORE FETCH: refusing after the read would still have run an
  // unscoped `*[_type == "speaker"]` over every tenant.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
  ])('fails closed on a %s org id, without querying', async (_label, orgId) => {
    const { speakers, err } = await getOrgSpeakerDirectory(orgId)
    expect(speakers).toEqual([])
    expect(err).toBeInstanceOf(Error)
    expect(clientReadUncached.fetch).not.toHaveBeenCalled()
  })

  it('projects the picker’s fields and withholds identity fields', async () => {
    const { speakers } = await getOrgSpeakerDirectory(THIS_ORG)
    const josh = speakers.find((s) => s._id === 'speaker-rejected-only')!

    expect(josh).toEqual({
      _id: 'speaker-rejected-only',
      name: 'Josh Rejected',
      title: 'Platform Engineer',
      email: 'josh@example.com',
      image: 'https://example.com/josh.png',
      slug: 'josh-rejected',
    })
    // Spelled out separately: `toEqual` above already excludes them, but these
    // are the fields whose leak would matter.
    expect(josh).not.toHaveProperty('knownEmails')
    expect(josh).not.toHaveProperty('providers')
    expect(josh).not.toHaveProperty('organizations')
  })

  it('defaults missing optional fields rather than dropping them', async () => {
    const { speakers } = await getOrgSpeakerDirectory(THIS_ORG)
    const ada = speakers.find((s) => s._id === 'speaker-participant')!

    expect(ada).toEqual({
      _id: 'speaker-participant',
      name: 'Ada Participant',
      title: '',
      email: 'ada@example.com',
      image: null,
      slug: null,
    })
  })
})
