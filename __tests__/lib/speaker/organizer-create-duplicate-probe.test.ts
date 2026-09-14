/**
 * @vitest-environment node
 *
 * `findSpeakerByEmailForOrganizerCreate` — the duplicate guard for the
 * organizer-create paths, exercised against the REAL GROQ engine (`groq-js`)
 * over an in-memory dataset. A mock of the query cannot tell us whether the
 * query means what the comment above it claims, and the two properties under
 * test are both properties of the query text:
 *
 *   1. it reaches ACROSS tenants (identity is a global person — an org-scoped
 *      probe strands placeholders that can never be claimed), while reporting
 *      whether the REQUEST's org has standing;
 *   2. it matches a stored address that carries surrounding whitespace, which
 *      `lower()` alone keeps and which Studio entry and imports produce.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluate, parse } from 'groq-js'
import { clientReadUncached } from '@/lib/sanity/client'
import { findSpeakerByEmailForOrganizerCreate } from '@/lib/speaker/sanity'

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn() },
  clientWrite: { create: vi.fn(), patch: vi.fn(), transaction: vi.fn() },
  clientReadCached: { fetch: vi.fn() },
}))

const THIS_ORG = 'org-this'
const OTHER_ORG = 'org-other'

/** Documents every case below draws from. */
const dataset = [
  {
    _id: 'speaker-member',
    _type: 'speaker',
    name: 'Member Of This Org',
    email: 'member@example.com',
    organizations: [{ _type: 'reference', _ref: THIS_ORG }],
  },
  {
    _id: 'speaker-foreign',
    _type: 'speaker',
    name: 'Foreign Tenant Person',
    email: 'foreign@example.com',
    providers: ['github:1'],
    organizations: [{ _type: 'reference', _ref: OTHER_ORG }],
  },
  {
    _id: 'speaker-padded',
    _type: 'speaker',
    name: 'Padded Address',
    // What Studio entry and CSV imports actually leave behind.
    email: '  Padded@Example.com  ',
    organizations: [{ _type: 'reference', _ref: OTHER_ORG }],
  },
  {
    _id: 'speaker-known-only',
    _type: 'speaker',
    name: 'Matched By KnownEmails',
    email: 'primary@example.com',
    knownEmails: ['secondary@example.com'],
    organizations: [{ _type: 'reference', _ref: OTHER_ORG }],
  },
  {
    _id: 'speaker-participant',
    _type: 'speaker',
    name: 'Participant Without Membership',
    email: 'participant@example.com',
  },
  // Tab- and NBSP-padded. `lower()` keeps both, and the needle side's JS
  // `.trim()` removes both, so a strip that covered only U+0020 would miss
  // these and create exactly the duplicate this guard exists to prevent.
  {
    _id: 'speaker-tab-padded',
    _type: 'speaker',
    name: 'Tab Padded',
    email: '\tTabbed@Example.com\n',
    organizations: [{ _type: 'reference', _ref: OTHER_ORG }],
  },
  {
    _id: 'speaker-nbsp-padded',
    _type: 'speaker',
    name: 'Nbsp Padded',
    // A REAL U+00A0, written as an escape so it survives review and editors.
    email: '\u00a0nbsp@example.com\u00a0',
    organizations: [{ _type: 'reference', _ref: OTHER_ORG }],
  },
  // TWO documents for ONE address — the duplicate case this guard is for. The
  // FOREIGN one is deliberately ordered FIRST, so a probe that takes `[0]`
  // reports `inCurrentOrg: false` and refuses the organizer who does have
  // standing over the local profile.
  {
    _id: 'speaker-shared-foreign',
    _type: 'speaker',
    name: 'Shared Address Foreign',
    email: 'shared@example.com',
    organizations: [{ _type: 'reference', _ref: OTHER_ORG }],
  },
  {
    _id: 'speaker-shared-local',
    _type: 'speaker',
    name: 'Shared Address Local',
    email: 'shared@example.com',
    organizations: [{ _type: 'reference', _ref: THIS_ORG }],
  },
  {
    _id: 'conf-this',
    _type: 'conference',
    organization: { _type: 'reference', _ref: THIS_ORG },
  },
  {
    _id: 'talk-this',
    _type: 'talk',
    conference: { _type: 'reference', _ref: 'conf-this' },
    speakers: [{ _type: 'reference', _ref: 'speaker-participant' }],
  },
]

/** Run whatever query the helper builds through the real GROQ engine. */
function useRealGroq() {
  vi.mocked(clientReadUncached.fetch).mockImplementation((async (
    query: string,
    params: Record<string, unknown>,
  ) => {
    const value = await evaluate(parse(query), { dataset, params })
    return value.get()
  }) as never)
}

describe('findSpeakerByEmailForOrganizerCreate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRealGroq()
  })

  it('finds a speaker of THIS org and reports standing, with the name', async () => {
    expect(
      await findSpeakerByEmailForOrganizerCreate(
        'member@example.com',
        THIS_ORG,
      ),
    ).toEqual({ inCurrentOrg: true, name: 'Member Of This Org' })
  })

  // THE BUG THIS REPLACED: an org-scoped probe returned null here, the
  // placeholder was created, and the login path then matched the OTHER
  // document — stranding it forever.
  it('finds a speaker of ANOTHER org, and withholds the name', async () => {
    const match = await findSpeakerByEmailForOrganizerCreate(
      'foreign@example.com',
      THIS_ORG,
    )
    expect(match).toEqual({ inCurrentOrg: false })
    expect(match).not.toHaveProperty('name')
  })

  it('matches a stored address with surrounding whitespace', async () => {
    expect(
      await findSpeakerByEmailForOrganizerCreate(
        'padded@example.com',
        THIS_ORG,
      ),
    ).toEqual({ inCurrentOrg: false })
  })

  it('matches on knownEmails, not only the display address', async () => {
    expect(
      await findSpeakerByEmailForOrganizerCreate(
        'secondary@example.com',
        THIS_ORG,
      ),
    ).toEqual({ inCurrentOrg: false })
  })

  // The pre-044 population: a talk at this org's conference, no membership ref.
  it('counts participation as standing, not just membership', async () => {
    expect(
      await findSpeakerByEmailForOrganizerCreate(
        'participant@example.com',
        THIS_ORG,
      ),
    ).toEqual({ inCurrentOrg: true, name: 'Participant Without Membership' })
  })

  it.each([
    ['tab and newline', 'tabbed@example.com'],
    ['NBSP', 'nbsp@example.com'],
  ])('matches a stored address padded with %s', async (_label, address) => {
    expect(
      await findSpeakerByEmailForOrganizerCreate(address, THIS_ORG),
    ).toEqual({ inCurrentOrg: false })
  })

  // FIX A. The foreign document sorts first in the dataset, so a probe that
  // takes `[0]` reports the foreign row and refuses with the generic message —
  // while the local profile the organizer should have picked is already in
  // their speaker picker.
  it('prefers the in-org match when two documents share an address', async () => {
    expect(
      await findSpeakerByEmailForOrganizerCreate(
        'shared@example.com',
        THIS_ORG,
      ),
    ).toEqual({ inCurrentOrg: true, name: 'Shared Address Local' })
  })

  it('never lets a foreign name out of the query itself', async () => {
    await findSpeakerByEmailForOrganizerCreate('foreign@example.com', THIS_ORG)
    // Not just the return value: the row the QUERY produced carries no name, so
    // a foreign name never reaches this process to be logged or leaked.
    const rows = await vi.mocked(clientReadUncached.fetch).mock.results[0].value
    expect(rows).toEqual([{ inCurrentOrg: false, name: null }])
  })

  it('returns null when nobody holds the address', async () => {
    expect(
      await findSpeakerByEmailForOrganizerCreate(
        'nobody@example.com',
        THIS_ORG,
      ),
    ).toBeNull()
  })

  it('does not query at all without an address or an org', async () => {
    expect(await findSpeakerByEmailForOrganizerCreate('', THIS_ORG)).toBeNull()
    expect(
      await findSpeakerByEmailForOrganizerCreate('member@example.com', ''),
    ).toBeNull()
    expect(clientReadUncached.fetch).not.toHaveBeenCalled()
  })
})
