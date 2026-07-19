vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/events/registry', () => ({}))

vi.mock('@/lib/events/bus', () => ({
  eventBus: { publish: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: vi.fn(),
    create: vi.fn(),
    patch: vi
      .fn()
      .mockReturnValue({ set: vi.fn().mockReturnValue({ commit: vi.fn() }) }),
    delete: vi.fn(),
  },
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(),
}))

vi.mock('@/lib/proposal/data/sanity', () => {
  class ProposalDeletionBlockedError extends Error {}
  return {
    getProposal: vi.fn(),
    getProposals: vi.fn(),
    createProposal: vi.fn(),
    updateProposal: vi.fn(),
    deleteProposal: vi.fn(),
    updateProposalStatus: vi.fn(),
    ProposalDeletionBlockedError,
  }
})

vi.mock('@/lib/proposal/server', () => ({
  updateProposalStatus: vi.fn(),
  getProposalSanity: vi.fn(),
}))

vi.mock('@/lib/conference/state', () => ({
  isCfpOpen: vi.fn(),
  isConferenceOver: vi.fn(),
  isWithdrawalCutoffActive: vi.fn(),
}))

// Messaging M4: the action procedure mirrors organizer decision comments into
// the proposal thread. Mock the messaging boundary; only the three functions
// the proposal router uses need real stubs (the message router's other imports
// from this module are never invoked in these tests).
vi.mock('@/lib/messaging/sanity', () => ({
  ensureProposalConversation: vi.fn(),
  getConversationById: vi.fn(),
  addMessage: vi.fn(),
}))

vi.mock('@/lib/messaging/notify', () => ({
  notifyNewMessage: vi.fn(),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import {
  createAnonymousCaller,
  createAuthenticatedCaller,
  createAdminCaller,
  speakers,
} from '../../helpers/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import {
  getProposal,
  getProposals,
  createProposal,
  deleteProposal,
  ProposalDeletionBlockedError,
} from '@/lib/proposal/data/sanity'
import { getProposalSanity, updateProposalStatus } from '@/lib/proposal/server'
import { isCfpOpen, isWithdrawalCutoffActive } from '@/lib/conference/state'
import {
  ensureProposalConversation,
  getConversationById,
  addMessage,
} from '@/lib/messaging/sanity'
import { notifyNewMessage } from '@/lib/messaging/notify'
import {
  Status,
  Action,
  Language,
  Format,
  Level,
  Audience,
} from '@/lib/proposal/types'

const regularSpeaker = speakers.find((s) => !s.isOrganizer)!
const adminSpeaker = speakers.find((s) => s.isOrganizer)!

const mockConference = {
  _id: 'conf-1',
  title: 'Cloud Native Day 2026',
  startDate: '2026-06-15',
  endDate: '2026-06-15',
  cfpStartDate: '2026-01-01',
  cfpEndDate: '2026-05-01',
  domains: ['localhost'],
}

const validProposalData = {
  title: 'My Talk',
  description: [
    { _type: 'block', children: [{ _type: 'span', text: 'A description' }] },
  ],
  language: Language.english,
  format: Format.presentation_25,
  level: Level.intermediate,
  audiences: [Audience.developer],
  topics: [{ _type: 'reference' as const, _ref: 'topic-1' }],
  tos: true,
}

const mockProposal = {
  _id: 'proposal-1',
  _rev: 'rev-1',
  _type: 'talk',
  _createdAt: '2026-01-15T00:00:00Z',
  _updatedAt: '2026-01-15T00:00:00Z',
  status: Status.submitted,
  speakers: [{ _id: regularSpeaker._id, name: regularSpeaker.name }],
  conference: { _id: mockConference._id },
  ...validProposalData,
}

describe('proposal router', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(getConferenceForCurrentDomain).mockResolvedValue({
      conference: mockConference as any,
      domain: 'localhost',
      error: null,
    })
  })

  describe('list', () => {
    it('should reject unauthenticated requests', async () => {
      const caller = createAnonymousCaller()
      await expect(caller.proposal.list()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })

    it('should return proposals for authenticated user', async () => {
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [mockProposal] as any,
        proposalsError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.list()
      expect(result).toHaveLength(1)
      expect(result[0]._id).toBe('proposal-1')
      expect(getProposals).toHaveBeenCalledWith(
        expect.objectContaining({ speakerId: regularSpeaker._id }),
      )
    })
  })

  describe('getById', () => {
    it('should reject unauthenticated requests', async () => {
      const caller = createAnonymousCaller()
      await expect(
        caller.proposal.getById({ id: 'proposal-1' }),
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })

    it('should return proposal for its speaker', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.getById({ id: 'proposal-1' })
      expect(result._id).toBe('proposal-1')
    })

    it('should reject access by non-speaker non-organizer', async () => {
      const otherSpeaker = speakers.find(
        (s) => s._id !== regularSpeaker._id && !s.isOrganizer,
      )!
      vi.mocked(getProposal).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(otherSpeaker._id)
      await expect(
        caller.proposal.getById({ id: 'proposal-1' }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('should allow organizer to view any proposal', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAdminCaller()
      const result = await caller.proposal.getById({ id: 'proposal-1' })
      expect(result._id).toBe('proposal-1')
    })

    it('should throw NOT_FOUND when proposal does not exist', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: null as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.getById({ id: 'nonexistent' }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })
  })

  describe('create', () => {
    it('should reject unauthenticated requests', async () => {
      const caller = createAnonymousCaller()
      await expect(
        caller.proposal.create({
          data: validProposalData,
          status: Status.submitted,
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    it('should reject when CFP is closed', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(false)

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.create({
          data: validProposalData,
          status: Status.submitted,
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('Call for Papers is currently closed'),
      })
    })

    it('should enforce max 3 proposals per conference', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [
          { ...mockProposal, _id: 'p1', status: Status.submitted },
          { ...mockProposal, _id: 'p2', status: Status.submitted },
          { ...mockProposal, _id: 'p3', status: Status.accepted },
        ] as any,
        proposalsError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.create({
          data: validProposalData,
          status: Status.submitted,
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('maximum of 3 proposals'),
      })
    })

    it('should allow new proposal when one of 3 is withdrawn', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [
          { ...mockProposal, _id: 'p1', status: Status.submitted },
          { ...mockProposal, _id: 'p2', status: Status.accepted },
          { ...mockProposal, _id: 'p3', status: Status.withdrawn },
        ] as any,
        proposalsError: null,
      })
      vi.mocked(createProposal).mockResolvedValue({
        proposal: mockProposal as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.create({
        data: validProposalData,
        status: Status.submitted,
      })
      expect(result._id).toBe('proposal-1')
      expect(createProposal).toHaveBeenCalled()
    })

    it('should allow new proposal when one of 3 is rejected', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [
          { ...mockProposal, _id: 'p1', status: Status.submitted },
          { ...mockProposal, _id: 'p2', status: Status.accepted },
          { ...mockProposal, _id: 'p3', status: Status.rejected },
        ] as any,
        proposalsError: null,
      })
      vi.mocked(createProposal).mockResolvedValue({
        proposal: mockProposal as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.create({
        data: validProposalData,
        status: Status.submitted,
      })
      expect(result._id).toBe('proposal-1')
      expect(createProposal).toHaveBeenCalled()
    })

    it('should create a draft without strict validation', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [],
        proposalsError: null,
      })
      vi.mocked(createProposal).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.create({
        data: { title: 'Draft talk' },
        status: Status.draft,
      })
      expect(result.status).toBe(Status.draft)
    })

    it('should create a submitted proposal with valid data', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [],
        proposalsError: null,
      })
      vi.mocked(createProposal).mockResolvedValue({
        proposal: mockProposal as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.create({
        data: validProposalData,
        status: Status.submitted,
      })
      expect(result._id).toBe('proposal-1')
      expect(createProposal).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'My Talk' }),
        regularSpeaker._id,
        mockConference._id,
        Status.submitted,
      )
    })

    it('should reject submitted proposal with missing required fields', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [],
        proposalsError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.create({
          data: { title: 'Incomplete' },
          status: Status.submitted,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })
  })

  describe('action', () => {
    it('should reject unauthenticated requests', async () => {
      const caller = createAnonymousCaller()
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })

    it('should reject invalid state transition', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      // submitted → submit is not a valid transition
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('should allow speaker to unsubmit their proposal when CFP is open', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.unsubmit,
      })
      expect(result.proposalStatus).toBe(Status.draft)
    })

    it('should block speaker from unsubmitting after CFP closes', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(false)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({
          id: 'proposal-1',
          action: Action.unsubmit,
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('Call for Papers has closed'),
      })
    })

    it('should allow organizer to unsubmit even after CFP closes', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(false)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        err: null,
      })

      const caller = createAdminCaller()
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.unsubmit,
      })
      expect(result.proposalStatus).toBe(Status.draft)
    })

    it('should allow speaker to withdraw a submitted proposal with a reason', async () => {
      vi.mocked(isWithdrawalCutoffActive).mockReturnValue(false)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.withdrawn } as any,
        err: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.withdraw,
        reason: 'I can no longer attend the conference.',
      })
      expect(result.proposalStatus).toBe(Status.withdrawn)
      // The reason is persisted alongside the status change.
      expect(vi.mocked(updateProposalStatus)).toHaveBeenCalledWith(
        'proposal-1',
        Status.withdrawn,
        'I can no longer attend the conference.',
      )
    })

    it('should reject a withdrawal with no reason (server-side)', async () => {
      vi.mocked(isWithdrawalCutoffActive).mockReturnValue(false)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({
          id: 'proposal-1',
          action: Action.withdraw,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('should reject a withdrawal whose reason is only whitespace', async () => {
      vi.mocked(isWithdrawalCutoffActive).mockReturnValue(false)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({
          id: 'proposal-1',
          action: Action.withdraw,
          reason: '   ',
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('should block speaker self-withdrawal within the cutoff window', async () => {
      vi.mocked(isWithdrawalCutoffActive).mockReturnValue(true)
      vi.mocked(updateProposalStatus).mockClear()
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({
          id: 'proposal-1',
          action: Action.withdraw,
          reason: 'Something came up.',
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('within 14 days'),
      })
      // Status must remain unchanged when blocked by the cutoff.
      expect(vi.mocked(updateProposalStatus)).not.toHaveBeenCalled()
    })

    it('should allow organizer to withdraw within the cutoff window', async () => {
      vi.mocked(isWithdrawalCutoffActive).mockReturnValue(true)
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.withdrawn } as any,
        err: null,
      })

      const caller = createAdminCaller()
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.withdraw,
        reason: 'Withdrawn on behalf of the speaker.',
      })
      expect(result.proposalStatus).toBe(Status.withdrawn)
    })

    it('should allow organizer to accept a submitted proposal', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.accepted } as any,
        err: null,
      })

      const caller = createAdminCaller()
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.accept,
      })
      expect(result.proposalStatus).toBe(Status.accepted)
    })

    it('should reject non-organizer performing admin actions', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      // accept is admin-only
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.accept }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('should enforce proposal cap when submitting a draft', async () => {
      vi.mocked(isCfpOpen).mockReturnValue(true)
      const draftProposal = { ...mockProposal, status: Status.draft }
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: draftProposal as any,
        proposalError: null,
      })
      vi.mocked(getProposals).mockResolvedValue({
        proposals: [
          { ...mockProposal, _id: 'p1', status: Status.submitted },
          { ...mockProposal, _id: 'p2', status: Status.submitted },
          { ...mockProposal, _id: 'p3', status: Status.accepted },
        ] as any,
        proposalsError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.submit }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('maximum of 3 proposals'),
      })
    })

    it('should return NOT_FOUND for nonexistent proposal', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: null as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({
          id: 'nonexistent',
          action: Action.withdraw,
          reason: 'No longer available.',
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('should surface PRECONDITION_FAILED when deleting a draft is blocked by references', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        proposalError: null,
      })
      vi.mocked(deleteProposal).mockResolvedValue({
        err: new ProposalDeletionBlockedError(
          'Cannot delete proposal: it is referenced by a published schedule. Remove those references first.',
        ),
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.delete }),
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: expect.stringContaining('referenced by a published schedule'),
      })
    })

    it('should keep INTERNAL_SERVER_ERROR for unexpected deletion failures', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.draft } as any,
        proposalError: null,
      })
      vi.mocked(deleteProposal).mockResolvedValue({
        err: new Error('network exploded'),
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({ id: 'proposal-1', action: Action.delete }),
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete proposal',
      })
    })
  })

  describe('action — decision comment mirrored to proposal thread (M4)', () => {
    beforeEach(() => {
      vi.mocked(ensureProposalConversation).mockClear()
      vi.mocked(getConversationById).mockClear()
      vi.mocked(addMessage).mockClear()
      vi.mocked(notifyNewMessage).mockClear()
    })

    const conversationId = 'conversation.proposal.proposal-1'
    const conversation = {
      _id: conversationId,
      conferenceId: 'conf-1',
      conversationType: 'proposal',
      proposalId: 'proposal-1',
      proposalTitle: 'My Talk',
      proposalSpeakerIds: [regularSpeaker._id],
      createdById: adminSpeaker._id,
      subject: 'My Talk',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastMessageAt: '2026-01-01T00:00:00.000Z',
    }
    const createdMessage = {
      _id: 'message.1',
      conversationId,
      authorId: adminSpeaker._id,
      body: 'Congrats — see you in Bergen!',
      createdAt: '2026-01-02T00:00:00.000Z',
    }

    function mockAcceptFlow() {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(updateProposalStatus).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.accepted } as any,
        err: null,
      })
      vi.mocked(ensureProposalConversation).mockResolvedValue(conversationId)
      vi.mocked(getConversationById).mockResolvedValue(conversation as any)
      vi.mocked(addMessage).mockResolvedValue(createdMessage as any)
      vi.mocked(notifyNewMessage).mockResolvedValue(undefined)
    }

    it('posts an organizer accept comment as a message and fans out', async () => {
      mockAcceptFlow()

      const caller = createAdminCaller()
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.accept,
        comment: 'Congrats — see you in Bergen!',
      })

      expect(result.proposalStatus).toBe(Status.accepted)
      expect(ensureProposalConversation).toHaveBeenCalledWith({
        conferenceId: 'conf-1',
        proposalId: 'proposal-1',
        proposalTitle: 'My Talk',
        createdById: adminSpeaker._id,
      })
      expect(addMessage).toHaveBeenCalledWith({
        conversationId,
        authorId: adminSpeaker._id,
        body: 'Congrats — see you in Bergen!',
      })
      expect(notifyNewMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversation,
          message: createdMessage,
          authorId: adminSpeaker._id,
        }),
      )
    })

    it('never fails the action when the messaging write throws', async () => {
      mockAcceptFlow()
      vi.mocked(ensureProposalConversation).mockRejectedValue(
        new Error('sanity down'),
      )
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      const caller = createAdminCaller()
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.accept,
        comment: 'Congrats!',
      })

      // The (already committed) status change wins; messaging failure is logged.
      expect(result.proposalStatus).toBe(Status.accepted)
      expect(addMessage).not.toHaveBeenCalled()
      expect(notifyNewMessage).not.toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to mirror decision comment into the proposal thread:',
        expect.any(Error),
      )
    })

    it('does not post to the thread when the comment is absent', async () => {
      mockAcceptFlow()

      const caller = createAdminCaller()
      const result = await caller.proposal.action({
        id: 'proposal-1',
        action: Action.accept,
      })

      expect(result.proposalStatus).toBe(Status.accepted)
      expect(ensureProposalConversation).not.toHaveBeenCalled()
      expect(addMessage).not.toHaveBeenCalled()
      expect(notifyNewMessage).not.toHaveBeenCalled()
    })

    it('does not post to the thread when the comment is only whitespace', async () => {
      mockAcceptFlow()

      const caller = createAdminCaller()
      await caller.proposal.action({
        id: 'proposal-1',
        action: Action.accept,
        comment: '   ',
      })

      expect(ensureProposalConversation).not.toHaveBeenCalled()
      expect(addMessage).not.toHaveBeenCalled()
    })
  })

  describe('admin.delete', () => {
    it('should delete the proposal for an organizer', async () => {
      vi.mocked(deleteProposal).mockResolvedValue({ err: null })

      const caller = createAdminCaller()
      const result = await caller.proposal.admin.delete({ id: 'proposal-1' })
      expect(result).toEqual({ success: true })
      expect(deleteProposal).toHaveBeenCalledWith('proposal-1')
    })

    it('should surface PRECONDITION_FAILED with the descriptive message when blocked', async () => {
      vi.mocked(deleteProposal).mockResolvedValue({
        err: new ProposalDeletionBlockedError(
          'Cannot delete proposal: it is referenced by workshop signups. Remove those references first.',
        ),
      })

      const caller = createAdminCaller()
      await expect(
        caller.proposal.admin.delete({ id: 'proposal-1' }),
      ).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message:
          'Cannot delete proposal: it is referenced by workshop signups. Remove those references first.',
      })
    })

    it('should keep INTERNAL_SERVER_ERROR for unexpected deletion failures', async () => {
      vi.mocked(deleteProposal).mockResolvedValue({
        err: new Error('network exploded'),
      })

      const caller = createAdminCaller()
      await expect(
        caller.proposal.admin.delete({ id: 'proposal-1' }),
      ).rejects.toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to delete proposal',
      })
    })
  })
})
