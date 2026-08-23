/**
 * @vitest-environment node
 *
 * WHAT THE PALETTE'S ONE QUERY ACTUALLY SELECTS.
 *
 * Collapsing three procedures into one object projection moves three
 * independently-reviewed tenant predicates into a single query literal. A
 * `toContain('$orgId')` assertion would pin the DIFF, not the MEANING: a
 * predicate can keep the substring and still widen (an `||` that escapes its
 * parentheses, a disjunct that forgets the org). So this evaluates the query
 * text the module ACTUALLY sends with `groq-js`, against a TWO-TENANT fixture,
 * and asserts on the documents that come back — the
 * `organizerCount.tenancy.test.ts` precedent.
 *
 * The fixture is deliberately adversarial: tenant B holds a talk, a sponsor, a
 * speaker and an organizer whose names ALL match the search term, so every
 * source has something to leak and a passing assertion cannot be an accident of
 * an empty other-tenant.
 */
import { describe, it, expect } from 'vitest'
import { parse, evaluate } from 'groq-js'
import fs from 'node:fs'
import path from 'node:path'

const CONF_A = 'conf-a'
const ORG_A = 'org-a'
const CONF_B = 'conf-b'
const ORG_B = 'org-b'

const ref = (id: string) => ({ _type: 'reference', _ref: id })

/**
 * The query is read out of the module SOURCE rather than exported, so the test
 * cannot drift from the string that ships and the module keeps no test-only
 * export. If the constant is renamed or removed this throws rather than
 * silently testing nothing.
 */
function unifiedSearchQuery(): string {
  const source = fs.readFileSync(path.join(__dirname, 'sanity.ts'), 'utf8')
  const match = source.match(/const UNIFIED_SEARCH_QUERY = groq`([\s\S]*?)`\n/)
  if (!match) {
    throw new Error(
      'UNIFIED_SEARCH_QUERY not found in src/lib/search/sanity.ts',
    )
  }
  return match[1]
}

type Doc = Record<string, unknown> & { _id: string; _type: string }

const dataset: Doc[] = [
  { _id: ORG_A, _type: 'organization', name: 'Org A' },
  { _id: ORG_B, _type: 'organization', name: 'Org B' },
  {
    _id: CONF_A,
    _type: 'conference',
    organization: ref(ORG_A),
    organizers: [ref('sp-a-organizer')],
  },
  {
    _id: CONF_B,
    _type: 'conference',
    organization: ref(ORG_B),
    organizers: [ref('sp-b-organizer')],
  },

  // --- speakers -----------------------------------------------------------
  {
    _id: 'sp-a-speaker',
    _type: 'speaker',
    name: 'Kubernetes Fan A',
    organizations: [ref(ORG_A)],
    _updatedAt: '2026-01-01',
  },
  {
    _id: 'sp-a-organizer',
    _type: 'speaker',
    name: 'Kubernetes Organizer A',
    organizations: [ref(ORG_A)],
    _updatedAt: '2026-01-01',
  },
  // Tenant B's people: same matching name, must never appear.
  {
    _id: 'sp-b-speaker',
    _type: 'speaker',
    name: 'Kubernetes Fan B',
    organizations: [ref(ORG_B)],
    _updatedAt: '2026-01-01',
  },
  {
    _id: 'sp-b-organizer',
    _type: 'speaker',
    name: 'Kubernetes Organizer B',
    organizations: [ref(ORG_B)],
    _updatedAt: '2026-01-01',
  },
  // Belongs to org A but has no talk at conference A and organizes nothing:
  // out of the corpus, exactly as `getSpeakers` scoped it.
  {
    _id: 'sp-a-bystander',
    _type: 'speaker',
    name: 'Kubernetes Bystander A',
    organizations: [ref(ORG_A)],
    _updatedAt: '2026-01-01',
  },

  // --- talks --------------------------------------------------------------
  {
    _id: 'talk-a',
    _type: 'talk',
    title: 'Kubernetes at scale',
    status: 'confirmed',
    format: 'presentation_25',
    conference: ref(CONF_A),
    speakers: [ref('sp-a-speaker')],
    _updatedAt: '2026-02-01',
  },
  {
    _id: 'talk-a-draft',
    _type: 'talk',
    title: 'Kubernetes draft',
    status: 'draft',
    format: 'presentation_25',
    conference: ref(CONF_A),
    speakers: [ref('sp-a-speaker')],
    _updatedAt: '2026-02-02',
  },
  {
    _id: 'talk-b',
    _type: 'talk',
    title: 'Kubernetes elsewhere',
    status: 'confirmed',
    format: 'presentation_25',
    conference: ref(CONF_B),
    speakers: [ref('sp-b-speaker')],
    _updatedAt: '2026-02-03',
  },

  // --- sponsors -----------------------------------------------------------
  {
    _id: 'sponsor-a',
    _type: 'sponsor',
    name: 'Kubernetes Corp A',
    website: 'https://a.example',
    organization: ref(ORG_A),
  },
  {
    _id: 'sponsor-b',
    _type: 'sponsor',
    name: 'Kubernetes Corp B',
    website: 'https://b.example',
    organization: ref(ORG_B),
  },
]

interface Result {
  proposals: { _id: string; title: string }[]
  sponsors: { _id: string; name: string }[]
  speakers: { _id: string; name: string; isOrganizer: boolean }[]
}

async function run(
  scope: { conferenceId: string; orgId: string },
  term = 'Kubernetes',
): Promise<Result> {
  const tree = parse(unifiedSearchQuery())
  const value = await evaluate(tree, {
    dataset,
    params: {
      conferenceId: scope.conferenceId,
      orgId: scope.orgId,
      term: `*${term}*`,
      namePrefix: `${term}*`,
      draftStatus: 'draft',
      speakerTalkStatuses: ['confirmed', 'accepted'],
    },
  })
  return (await value.get()) as Result
}

const ids = (rows: { _id: string }[]) => rows.map((r) => r._id).sort()

describe('the unified palette query, evaluated for tenant A', () => {
  it('returns tenant A proposals and NOT tenant B ones', async () => {
    const result = await run({ conferenceId: CONF_A, orgId: ORG_A })

    expect(ids(result.proposals)).toEqual(['talk-a'])
  })

  it('keeps drafts out, as `proposal.admin.search` did', async () => {
    const result = await run({ conferenceId: CONF_A, orgId: ORG_A })

    expect(ids(result.proposals)).not.toContain('talk-a-draft')
  })

  it('returns tenant A sponsors and NOT tenant B ones', async () => {
    const result = await run({ conferenceId: CONF_A, orgId: ORG_A })

    expect(ids(result.sponsors)).toEqual(['sponsor-a'])
  })

  it('returns tenant A speakers and organizers, and NOT tenant B ones', async () => {
    const result = await run({ conferenceId: CONF_A, orgId: ORG_A })

    // The organizer has NO talk at this conference and is included anyway —
    // that is the `getOrganizers` half of the union `speaker.admin.search`
    // merged in. The bystander belongs to org A but neither speaks here nor
    // organizes, so the corpus predicate excludes them, exactly as before.
    expect(ids(result.speakers)).toEqual(['sp-a-organizer', 'sp-a-speaker'])
  })

  it('marks the organizer as such, so the sort can float them to the top', async () => {
    const result = await run({ conferenceId: CONF_A, orgId: ORG_A })

    const byId = Object.fromEntries(result.speakers.map((s) => [s._id, s]))
    expect(byId['sp-a-organizer'].isOrganizer).toBe(true)
    expect(byId['sp-a-speaker'].isOrganizer).toBe(false)
  })
})

describe('the same query, evaluated for tenant B', () => {
  it('returns B’s rows and none of A’s — the scope is the parameters, not the text', async () => {
    const result = await run({ conferenceId: CONF_B, orgId: ORG_B })

    expect(ids(result.proposals)).toEqual(['talk-b'])
    expect(ids(result.sponsors)).toEqual(['sponsor-b'])
    expect(ids(result.speakers)).toEqual(['sp-b-organizer', 'sp-b-speaker'])
  })
})

describe('a term that matches nothing', () => {
  it('returns three empty lists rather than the whole dataset', async () => {
    const result = await run({ conferenceId: CONF_A, orgId: ORG_A }, 'zzzz')

    expect(result.proposals).toEqual([])
    expect(result.sponsors).toEqual([])
    // Speakers are matched in JS (see `matchesSpeaker`), so the corpus is
    // unaffected by the term — that is the documented behaviour, not a leak:
    // every row here is still tenant A's.
    expect(ids(result.speakers)).toEqual(['sp-a-organizer', 'sp-a-speaker'])
  })
})
