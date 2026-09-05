/**
 * @vitest-environment node
 *
 * DUAL-ROLE tenant isolation for the proposal router (S1 follow-up, PR #984).
 *
 * The persona is the exact actor `withOrgOrganizer`'s contract names: one
 * person who is an ORGANIZER of org A and a SPEAKER at tenant B, making
 * requests on org A's domain. `getProposal`'s owner-∨-organizer read admits
 * their OWN tenant-B proposal through the OWNER arm — and that read success
 * must never be mistaken for organizer privilege over the document:
 *
 *  - `getById` / `admin.getById` must not hand them tenant B's confidential
 *    reviews (admin surface: NOT_FOUND outright, as before S1);
 *  - `action` must not let the org-A organizer bit accept/reject their own
 *    tenant-B proposal (cross-tenant self-acceptance), while owner transitions
 *    (withdraw) stay available;
 *  - `admin.submitReview` must not write a review into tenant B's conference.
 *
 * REAL routers, REAL middlewares, REAL GROQ: only the Sanity clients are
 * mocked, and every data read evaluates the module's actual query through
 * `groq-js` over a two-tenant dataset (the domain-conference read is canned,
 * exactly as `message.reads.test.ts` does).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  headers: async () => new Map([['host', 'a.test']]),
}))
vi.mock('next/cache', () => ({
  cacheTag: () => {},
  cacheLife: () => {},
  revalidateTag: () => {},
}))

const { fetchMock, patchCalls, createCalls } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  patchCalls: [] as { id: string; fields: Record<string, unknown> }[],
  createCalls: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/sanity/client', () => {
  const patchChain = (id: string) => {
    const fields: Record<string, unknown> = {}
    const chain = {
      set: (data: Record<string, unknown>) => {
        Object.assign(fields, data)
        return chain
      },
      unset: () => chain,
      setIfMissing: () => chain,
      append: () => chain,
      commit: async () => {
        patchCalls.push({ id, fields })
        return { _id: id, ...fields }
      },
    }
    return chain
  }
  return {
    clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
    clientReadCached: { fetch: (...a: unknown[]) => fetchMock(...a) },
    clientWrite: {
      fetch: (...a: unknown[]) => fetchMock(...a),
      patch: (id: string) => patchChain(id),
      create: async (doc: Record<string, unknown>) => {
        createCalls.push(doc)
        return { _id: 'rev-new', ...doc }
      },
    },
  }
})

import { parse, evaluate } from 'groq-js'
import { proposalRouter } from './proposal'
import { Action } from '@/lib/proposal/types'
import type { Context } from '@/server/trpc'

const ref = (id: string) => ({ _type: 'reference', _ref: id })

/** Org A's domain conference — what `a.test` resolves to. */
const DOMAIN_CONFERENCE = {
  _id: 'conf-A',
  title: 'Conf A',
  organization: { _ref: 'org-A' },
  domains: ['a.test'],
}

const DATASET = [
  { _id: 'org-A', _type: 'organization', name: 'Org A' },
  { _id: 'org-B', _type: 'organization', name: 'Org B' },
  { _id: 'conf-A', _type: 'conference', organization: ref('org-A') },
  { _id: 'conf-B', _type: 'conference', organization: ref('org-B') },
  { _id: 'sp-dual', _type: 'speaker', name: 'Dual Role', email: 'd@x.test' },
  { _id: 'sp-other', _type: 'speaker', name: 'Other', email: 'o@x.test' },
  {
    _id: 'talk-A',
    _type: 'talk',
    title: 'Org A talk',
    status: 'submitted',
    conference: ref('conf-A'),
    speakers: [ref('sp-other')],
  },
  // The dual-role caller's OWN proposal at tenant B.
  {
    _id: 'talk-B',
    _type: 'talk',
    title: 'Own talk at tenant B',
    status: 'submitted',
    conference: ref('conf-B'),
    speakers: [ref('sp-dual')],
  },
  {
    _id: 'rev-A',
    _type: 'review',
    proposal: ref('talk-A'),
    reviewer: ref('sp-other'),
    comment: 'org-A internal review',
    score: { content: 3, relevance: 3, speaker: 3 },
  },
  // Tenant B's confidential review of the caller's own talk.
  {
    _id: 'rev-B',
    _type: 'review',
    proposal: ref('talk-B'),
    reviewer: ref('sp-other'),
    comment: 'SECRET tenant-B review',
    score: { content: 1, relevance: 2, speaker: 3 },
  },
]

/** ORGANIZER of org A ∧ SPEAKER at tenant B — the dual-role caller. */
function dualRoleCtx(): Context {
  const speaker = {
    _id: 'sp-dual',
    name: 'Dual Role',
    email: 'd@x.test',
    organizerOrgIds: ['org-A'],
  }
  const session = { speaker, user: { email: 'd@x.test' } }
  return {
    req: {},
    session,
    speaker,
    user: session.user,
  } as unknown as Context
}

const caller = () => proposalRouter.createCaller(dualRoleCtx())

beforeEach(() => {
  vi.clearAllMocks()
  patchCalls.length = 0
  createCalls.length = 0
  fetchMock.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) => {
      if (query.includes('_type == "conference" && ($domain in domains')) {
        return DOMAIN_CONFERENCE
      }
      return await (
        await evaluate(parse(query), { dataset: DATASET, params })
      ).get()
    },
  )
})

describe('dual-role organizer ∧ foreign-tenant speaker (owner arm ≠ organizer privilege)', () => {
  it('getById serves their own tenant-B proposal WITHOUT tenant B’s reviews', async () => {
    const proposal = await caller().getById({ id: 'talk-B' })

    expect(proposal).toMatchObject({ _id: 'talk-B' })
    expect(proposal.reviews ?? []).toEqual([])
    expect(JSON.stringify(proposal)).not.toContain('SECRET')
  })

  it('admin.getById answers NOT_FOUND for the foreign-tenant own proposal (as main did)', async () => {
    await expect(
      caller().admin.getById({ id: 'talk-B' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('admin.getById still serves the REQUEST org’s proposal, reviews included', async () => {
    const proposal = await caller().admin.getById({ id: 'talk-A' })

    expect(proposal).toMatchObject({ _id: 'talk-A' })
    expect(proposal.reviews?.map((r) => r._id)).toEqual(['rev-A'])
  })

  it('action refuses organizer transitions on the foreign own proposal — no cross-tenant self-acceptance', async () => {
    // The read SUCCEEDS (owner arm) — the refusal must be the state machine
    // denying an organizer-only transition, not a failed fetch.
    await expect(
      caller().action({ id: 'talk-B', action: Action.accept, notify: false }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('Invalid action accept'),
    })
    expect(patchCalls).toEqual([])
  })

  it('action keeps OWNER transitions on their own foreign proposal (withdraw)', async () => {
    const result = await caller().action({
      id: 'talk-B',
      action: Action.withdraw,
      notify: false,
      reason: 'Cannot attend after all',
    })

    expect(result.proposalStatus).toBe('withdrawn')
    expect(patchCalls.map((p) => p.id)).toEqual(['talk-B'])
    expect(patchCalls[0].fields).toMatchObject({ status: 'withdrawn' })
  })

  it('admin.submitReview refuses to write a review into the foreign tenant', async () => {
    await expect(
      caller().admin.submitReview({
        id: 'talk-B',
        comment: 'sneaky',
        score: { content: 5, relevance: 5, speaker: 5 },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(createCalls).toEqual([])
  })

  it('admin.submitReview still reviews the REQUEST org’s proposals', async () => {
    const review = await caller().admin.submitReview({
      id: 'talk-A',
      comment: 'solid',
      score: { content: 4, relevance: 4, speaker: 4 },
    })

    expect(review).toMatchObject({ _id: 'rev-new' })
    expect(createCalls).toHaveLength(1)
    expect(createCalls[0]).toMatchObject({
      proposal: { _ref: 'talk-A' },
      conference: { _ref: 'conf-A' },
      reviewer: { _ref: 'sp-dual' },
    })
  })
})
