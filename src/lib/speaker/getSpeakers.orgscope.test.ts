/**
 * @vitest-environment node
 *
 * getSpeakers with ONLY an orgId must stay inside the org (#1876).
 *
 * The speaker-selection `count(*[talk ...])` used to carry only the conference
 * filter, which is empty when no conferenceId is given. A speaker belonging to
 * org A then qualified on a talk at org B's conference, and with
 * includeProposalsFromOtherConferences=false the nested proposals were not
 * scoped either. The query the function sends is evaluated with groq-js
 * against a two-tenant fixture, so the assertions are about what comes back.
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
import { getSpeakersUncached } from './sanity'
import { Status } from '@/lib/proposal/types'

type Doc = Record<string, unknown> & { _id: string; _type: string }
const ref = (id: string) => ({ _type: 'reference', _ref: id })

const dataset: Doc[] = [
  { _id: 'org-A', _type: 'organization' },
  { _id: 'org-B', _type: 'organization' },
  { _id: 'conf-a', _type: 'conference', organization: ref('org-A') },
  { _id: 'conf-b', _type: 'conference', organization: ref('org-B') },
  // Member of org A, but speaks only at org B's conference.
  {
    _id: 'spk-only-b',
    _type: 'speaker',
    name: 'Only B',
    organizations: [ref('org-A')],
  },
  // Speaks at both orgs' conferences.
  { _id: 'spk-both', _type: 'speaker', name: 'Both' },
  {
    _id: 'talk-only-b',
    _type: 'talk',
    status: 'confirmed',
    conference: ref('conf-b'),
    speakers: [ref('spk-only-b')],
  },
  {
    _id: 'talk-both-a',
    _type: 'talk',
    status: 'confirmed',
    conference: ref('conf-a'),
    speakers: [ref('spk-both')],
  },
  {
    _id: 'talk-both-b',
    _type: 'talk',
    status: 'confirmed',
    conference: ref('conf-b'),
    speakers: [ref('spk-both')],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  h.fetch.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      await (await evaluate(parse(query), { dataset, params })).get(),
  )
})

function shape(
  speakers: { _id: string; proposals: { _id: string }[] }[],
): Record<string, string[]> {
  return Object.fromEntries(
    speakers.map((s) => [s._id, s.proposals.map((p) => p._id).sort()]),
  )
}

describe('getSpeakers — orgId only', () => {
  it.each([false, true])(
    'returns only speakers and talks in the org (crossConferences=%s)',
    async (cross) => {
      const { speakers, err } = await getSpeakersUncached(
        undefined,
        [Status.confirmed],
        cross,
        'org-A',
      )
      expect(err).toBeNull()
      expect(shape(speakers)).toEqual({ 'spk-both': ['talk-both-a'] })
    },
  )

  it('a conference-scoped call is unchanged', async () => {
    const { speakers } = await getSpeakersUncached('conf-b', [Status.confirmed])
    expect(shape(speakers)).toEqual({
      'spk-both': ['talk-both-b'],
      'spk-only-b': ['talk-only-b'],
    })
  })
})
