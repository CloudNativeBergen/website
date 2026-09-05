/**
 * @vitest-environment node
 *
 * TENANCY REGRESSIONS for the messaging data layer (#616, slice S2).
 *
 * `getProposalForConversation` takes a CLIENT-supplied proposal id
 * (`message.send`'s `input.proposalId`) and used to read it with
 * `*[_type == "talk" && _id == $proposalId]` — a dataset-wide key, so an
 * organizer (or speaker) of tenant A could resolve tenant B's proposal title
 * and speaker set. The router's `conferenceId` compare caught the cross-tenant
 * case AFTER the read; the fix moves the conference predicate INTO the query
 * (the #863 posture: guard in the query, caller compare kept as the second
 * control), so a foreign document never even enters the request.
 *
 * WHY A REAL GROQ ENGINE, not a query-text assertion: a `toContain(...)`
 * harness pins the diff, not the meaning — a widened predicate that keeps the
 * substring would pass. Here the mocked `clientReadUncached.fetch` EVALUATES
 * the query the function actually sent, with `groq-js`, against a two-tenant
 * fixture, so the assertions are about the DOCUMENT that comes back (the
 * organizerCount.tenancy.test.ts convention).
 */

const h = vi.hoisted(() => ({ fetch: vi.fn() }))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
  clientReadCached: { fetch: h.fetch },
  clientWrite: { fetch: h.fetch },
}))
vi.mock('@/lib/sanity/helpers', () => ({
  createReference: (id: string) => ({ _type: 'reference', _ref: id }),
}))
vi.mock('@/lib/teams', () => ({
  getViewerTeamKeys: vi.fn(async () => []),
}))
vi.mock('@/lib/notification/sanity', () => ({
  getOrganizerSpeakerIds: vi.fn(async () => []),
  getOrganizerSpeakerIdsForOrg: vi.fn(async () => []),
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefViaParentConference: vi.fn(async () => null),
  organizationField: () => ({}),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parse, evaluate } from 'groq-js'
import { getProposalForConversation } from './sanity'

type Doc = Record<string, unknown> & { _id: string; _type: string }

const ref = (id: string) => ({ _type: 'reference', _ref: id })

/** Two tenants, one proposal each — the decisive fixture is the FOREIGN one. */
const dataset: Doc[] = [
  {
    _id: 'talk-a',
    _type: 'talk',
    title: 'Talk A',
    conference: ref('conf-a'),
    speakers: [ref('spk-a1'), ref('spk-a2')],
  },
  {
    _id: 'talk-b',
    _type: 'talk',
    title: 'Talk B',
    conference: ref('conf-b'),
    speakers: [ref('spk-b1')],
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  // No branching on the query text: nothing here can agree with a wrong
  // predicate — the answer IS whatever the sent query selects.
  h.fetch.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      await (await evaluate(parse(query), { dataset, params })).get(),
  )
})

describe('getProposalForConversation — the conference predicate lives IN the query', () => {
  it('resolves the request conference’s own proposal', async () => {
    const proposal = await getProposalForConversation('talk-a', 'conf-a')

    expect(proposal).toEqual({
      conferenceId: 'conf-a',
      title: 'Talk A',
      speakerIds: ['spk-a1', 'spk-a2'],
    })
  })

  // THE SABOTAGE CASE: a foreign proposal id must come back exactly like a
  // nonexistent one — no title, no speaker set, no existence oracle.
  it('refuses tenant B’s proposal id on tenant A’s conference: null, like a nonexistent id', async () => {
    const foreign = await getProposalForConversation('talk-b', 'conf-a')
    const missing = await getProposalForConversation('talk-nope', 'conf-a')

    expect(foreign).toBeNull()
    expect(foreign).toEqual(missing)
  })

  it('still resolves the same id for ITS OWN tenant', async () => {
    const proposal = await getProposalForConversation('talk-b', 'conf-b')

    expect(proposal).toMatchObject({
      conferenceId: 'conf-b',
      speakerIds: ['spk-b1'],
    })
  })

  // MUTATION CHECK: delete the `if (!conferenceId)` guard and this fails — the
  // query goes out with an unbound tenant and GROQ's `null == null` semantics
  // are not something an authz path may lean on.
  it('FAILS CLOSED on an unresolved conference: no query is issued', async () => {
    const proposal = await getProposalForConversation(
      'talk-a',
      undefined as unknown as string,
    )

    expect(proposal).toBeNull()
    expect(h.fetch).not.toHaveBeenCalled()
  })
})
