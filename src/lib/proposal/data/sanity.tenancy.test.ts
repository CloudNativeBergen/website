/**
 * @vitest-environment node
 *
 * TENANT SCOPING for the proposal reads (S1, RunKonf/platform#53, #616), at
 * the #858 bar: every case below runs the module's REAL GROQ through `groq-js`
 * over a TWO-TENANT dataset, exactly like `src/server/tenancy.exploits.test.ts`
 * — no assertion branches on the query text, so a predicate that is dropped,
 * reordered into a fail-open disjunct, or reversed fails here on tenant B's
 * document coming back, not on a moved error message.
 *
 * The shapes pinned:
 *  - `getProposal` carries the owner-∨-organizer access predicate IN the query
 *    (`$speakerId in speakers[]._ref || conference->organization._ref in
 *    $orgIds`), so a foreign id evaluates to `null` exactly like a nonexistent
 *    one — no existence oracle.
 *  - `getProposals` requires a tenant dimension (conference or org) and FAILS
 *    CLOSED — no query at all — without one. The org dimension keeps a
 *    dual-org speaker's foreign-tenant talks OUT of a tenant-domain list.
 *  - `searchProposals` requires a conference and never matches across it.
 *
 * SABOTAGE-VERIFIED: stripping the owner-∨-organizer disjunct from
 * `getProposal`, or the tenant disjunct from `getProposals`/`searchProposals`,
 * makes the foreign-document cases below fail on tenant B's title coming back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
  clientWrite: { fetch: (...a: unknown[]) => fetchMock(...a) },
}))

import { parse, evaluate } from 'groq-js'
import { getProposal, getProposals, searchProposals } from './sanity'
import { Status } from '@/lib/proposal/types'

const ORG_A = 'org-A'
const ORG_B = 'org-B'
const FOREIGN_TITLE = 'FOREIGN Kubernetes Secrets'

const ref = (id: string) => ({ _type: 'reference', _ref: id })

/**
 * Both tenants in one dataset. `sp-shared` speaks at BOTH orgs — the dual-role
 * case an org predicate must not blur — and `sp-B` belongs to tenant B alone.
 */
const DATASET = [
  { _id: ORG_A, _type: 'organization', name: 'Org A' },
  { _id: ORG_B, _type: 'organization', name: 'Org B' },
  {
    _id: 'conf-A',
    _type: 'conference',
    title: 'Conf A',
    organization: ref(ORG_A),
  },
  {
    _id: 'conf-A2',
    _type: 'conference',
    title: 'Conf A second edition',
    organization: ref(ORG_A),
  },
  {
    _id: 'conf-B',
    _type: 'conference',
    title: 'Conf B',
    organization: ref(ORG_B),
  },
  { _id: 'sp-shared', _type: 'speaker', name: 'Shared Speaker' },
  { _id: 'sp-B', _type: 'speaker', name: 'Tenant B Speaker' },
  {
    _id: 'talk-A',
    _type: 'talk',
    title: 'Kubernetes at A',
    status: 'submitted',
    conference: ref('conf-A'),
    speakers: [ref('sp-shared')],
  },
  {
    _id: 'talk-A-draft',
    _type: 'talk',
    title: 'Draft at A',
    status: 'draft',
    conference: ref('conf-A'),
    speakers: [ref('sp-shared')],
  },
  {
    _id: 'talk-A2',
    _type: 'talk',
    title: 'Confirmed at A2',
    status: 'confirmed',
    format: 'workshop_120',
    conference: ref('conf-A2'),
    speakers: [ref('sp-shared')],
  },
  // The shared speaker's OWN talk at tenant B: visible to them as owner, but
  // never on tenant A's org-scoped surfaces.
  {
    _id: 'talk-B',
    _type: 'talk',
    title: 'Kubernetes at B',
    status: 'submitted',
    conference: ref('conf-B'),
    speakers: [ref('sp-shared')],
  },
  {
    _id: 'talk-B2',
    _type: 'talk',
    title: FOREIGN_TITLE,
    status: 'submitted',
    conference: ref('conf-B'),
    speakers: [ref('sp-B')],
  },
  {
    _id: 'inv-A',
    _type: 'coSpeakerInvitation',
    proposal: ref('talk-A'),
    invitedEmail: 'a@x.test',
    status: 'pending',
  },
  {
    _id: 'inv-B',
    _type: 'coSpeakerInvitation',
    proposal: ref('talk-B2'),
    invitedEmail: 'b@x.test',
    status: 'pending',
  },
]

/** Back every read with a real GROQ evaluation. */
function useDataset() {
  fetchMock.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) =>
      await (await evaluate(parse(query), { dataset: DATASET, params })).get(),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useDataset()
})

describe('getProposal — the query refuses a foreign id (S1)', () => {
  it('admits the org-A organizer to an org-A proposal they do not own', async () => {
    const { proposal, proposalError } = await getProposal({
      id: 'talk-A',
      speakerId: 'sp-admin',
      isOrganizer: true,
      organizerOrgId: ORG_A,
    })

    expect(proposalError).toBeNull()
    expect(proposal).toMatchObject({ _id: 'talk-A', title: 'Kubernetes at A' })
    // The parent-keyed nested read, evaluated for real: only talk-A's own
    // invitations, never tenant B's.
    expect(
      (
        proposal as unknown as { coSpeakerInvitations: { _id: string }[] }
      ).coSpeakerInvitations.map((i) => i._id),
    ).toEqual(['inv-A'])
  })

  it('answers a FOREIGN id exactly like a nonexistent one — no oracle', async () => {
    const foreign = await getProposal({
      id: 'talk-B2',
      speakerId: 'sp-admin',
      isOrganizer: true,
      organizerOrgId: ORG_A,
    })
    const missing = await getProposal({
      id: 'talk-nope',
      speakerId: 'sp-admin',
      isOrganizer: true,
      organizerOrgId: ORG_A,
    })

    // Unscoped, `foreign.proposal` IS tenant B's document — this line fails
    // printing the title it handed over.
    expect(foreign.proposal).toBeNull()
    expect(foreign).toEqual(missing)
    expect(JSON.stringify(foreign)).not.toContain(FOREIGN_TITLE)
  })

  it('still admits the OWNER, who organizes nothing — even across orgs', async () => {
    const { proposal } = await getProposal({
      id: 'talk-B',
      speakerId: 'sp-shared',
      isOrganizer: false,
    })

    expect(proposal).toMatchObject({ _id: 'talk-B' })
  })

  it('refuses a non-owner non-organizer', async () => {
    const { proposal } = await getProposal({
      id: 'talk-A',
      speakerId: 'sp-B',
      isOrganizer: false,
    })

    expect(proposal).toBeNull()
  })

  it('FAILS CLOSED for an organizer with no resolvable org: owner arm only', async () => {
    const own = await getProposal({
      id: 'talk-A',
      speakerId: 'sp-shared',
      isOrganizer: true,
      organizerOrgId: null,
    })
    const notOwn = await getProposal({
      id: 'talk-B2',
      speakerId: 'sp-shared',
      isOrganizer: true,
      organizerOrgId: null,
    })

    expect(own.proposal).toMatchObject({ _id: 'talk-A' })
    expect(notOwn.proposal).toBeNull()
  })
})

describe('getProposals — one tenant dimension, enforced in the query (S1)', () => {
  it('conference-scoped list never contains the other tenant', async () => {
    const { proposals, proposalsError } = await getProposals({
      conferenceId: 'conf-A',
      returnAll: true,
    })

    expect(proposalsError).toBeNull()
    expect(proposals.map((p) => p._id)).toEqual(['talk-A'])
    expect(JSON.stringify(proposals)).not.toContain(FOREIGN_TITLE)
  })

  it('org-scoped owner list spans the org’s editions but NOT the speaker’s foreign-tenant talks', async () => {
    const { proposals } = await getProposals({
      speakerId: 'sp-shared',
      orgId: ORG_A,
      returnAll: false,
    })

    const ids = proposals.map((p) => p._id).sort()
    // Own drafts ARE visible to the owner; talk-B (their OWN talk at tenant B)
    // is not on tenant A's surface.
    expect(ids).toEqual(['talk-A', 'talk-A-draft', 'talk-A2'])
    expect(ids).not.toContain('talk-B')
  })

  it('returnAll excludes drafts, owner mode keeps them (behavior preserved)', async () => {
    const all = await getProposals({ conferenceId: 'conf-A', returnAll: true })
    const own = await getProposals({
      conferenceId: 'conf-A',
      speakerId: 'sp-shared',
      returnAll: false,
    })

    expect(all.proposals.map((p) => p._id)).toEqual(['talk-A'])
    expect(own.proposals.map((p) => p._id).sort()).toEqual([
      'talk-A',
      'talk-A-draft',
    ])
  })

  it('statuses/formats narrow via bound params (no interpolated enum lists)', async () => {
    const { proposals } = await getProposals({
      conferenceId: 'conf-A2',
      returnAll: true,
      statuses: [Status.confirmed],
      formats: ['workshop_120'],
    })

    expect(proposals.map((p) => p._id)).toEqual(['talk-A2'])
    const [, params] = fetchMock.mock.calls.at(-1) as [
      string,
      Record<string, unknown>,
    ]
    expect(params.statuses).toEqual(['confirmed'])
    expect(params.formats).toEqual(['workshop_120'])
  })

  it('FAILS CLOSED with no tenant dimension: no query, no proposals', async () => {
    const { proposals, proposalsError } = await getProposals({
      speakerId: 'sp-shared',
      returnAll: false,
    })

    expect(proposals).toEqual([])
    expect(proposalsError).toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('searchProposals — matches never cross the conference (S1)', () => {
  it('a term present in BOTH tenants returns only this conference’s talk', async () => {
    const { proposals, proposalsError } = await searchProposals({
      query: 'Kubernetes',
      conferenceId: 'conf-A',
    })

    expect(proposalsError).toBeNull()
    expect(proposals.map((p) => p._id)).toEqual(['talk-A'])
    expect(JSON.stringify(proposals)).not.toContain(FOREIGN_TITLE)
  })

  it('FAILS CLOSED without a conference: no query, no results', async () => {
    const { proposals, proposalsError } = await searchProposals({
      query: 'Kubernetes',
    })

    expect(proposals).toEqual([])
    expect(proposalsError).toBeInstanceOf(Error)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
