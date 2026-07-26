/**
 * @vitest-environment node
 *
 * B1 (#642) — ROUTER gate. `proposal.getById` is an `organizerProcedure`: the
 * middleware resolves the request org from the domain conference and exposes an
 * ORG-SCOPED `ctx.isOrgOrganizer`. An organizer of ANOTHER org (on this domain)
 * therefore gets `isOrgOrganizer === false` and is treated as a plain speaker —
 * so an org-A proposal is invisible to an org-B organizer, while a same-org
 * organizer reads it. We drive the caller and assert the getProposal invocation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

const getProposalMock = vi.fn()
const getConfMock = vi.fn()

vi.mock('@/lib/proposal/data/sanity', () => ({
  getProposal: (...a: unknown[]) => getProposalMock(...a),
  getProposals: vi.fn(),
  createProposal: vi.fn(),
  updateProposal: vi.fn(),
  deleteProposal: vi.fn(),
  ProposalDeletionBlockedError: class extends Error {},
}))
vi.mock('@/lib/proposal/server', () => ({
  getProposalSanity: (...a: unknown[]) => getProposalMock(...a),
  getProposals: vi.fn(),
  updateProposalStatus: vi.fn(),
  fetchNextUnreviewedProposal: vi.fn(),
  searchProposals: vi.fn(),
}))
// resolveOrganizationId (trpc waist) resolves the request org from the domain.
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...a: unknown[]) => getConfMock(...a),
}))

import { proposalRouter } from './proposal'

function callerFor(speaker: {
  _id: string
  isOrganizer?: boolean
  organizerOrgIds?: string[]
}) {
  const session = { speaker, user: { email: 'u@x.test' } }
  return proposalRouter.createCaller({
    session,
    speaker,
    user: session.user,
  } as unknown as Context)
}

const ORG_A_PROPOSAL = {
  _id: 'talk-A',
  speakers: [{ _id: 'sp-owner' }],
  conference: { _id: 'conf-A' },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  // Current domain resolves to org-A.
  getConfMock.mockResolvedValue({
    conference: { _id: 'conf-A', organization: { _ref: 'org-A' } },
    error: null,
  })
})

describe('proposal.getById — org-scoped organizer gate (B1)', () => {
  it('DENIES a cross-tenant organizer (org-B) an org-A proposal by id', async () => {
    // The org-scoped read yields the proposal only via the ownership branch;
    // a non-owner org-B caller is treated as a speaker → getProposal returns the
    // (non-owned) doc and the handler enforces ownership → FORBIDDEN.
    getProposalMock.mockResolvedValue({
      proposal: ORG_A_PROPOSAL,
      proposalError: null,
    })
    const caller = callerFor({
      _id: 'org-b-admin',
      isOrganizer: true,
      organizerOrgIds: ['org-B'],
    })
    await expect(caller.getById({ id: 'talk-A' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    // Proven org-scoped: the router passed isOrganizer=false for the org-B caller.
    expect(getProposalMock).toHaveBeenCalledWith(
      expect.objectContaining({ isOrganizer: false, organizerOrgId: 'org-A' }),
    )
  })

  it('GRANTS a same-org organizer (org-A) the org-A proposal', async () => {
    getProposalMock.mockResolvedValue({
      proposal: ORG_A_PROPOSAL,
      proposalError: null,
    })
    const caller = callerFor({
      _id: 'org-a-admin',
      isOrganizer: true,
      organizerOrgIds: ['org-A'],
    })
    const res = await caller.getById({ id: 'talk-A' })
    expect(res._id).toBe('talk-A')
    expect(getProposalMock).toHaveBeenCalledWith(
      expect.objectContaining({ isOrganizer: true, organizerOrgId: 'org-A' }),
    )
  })
})
