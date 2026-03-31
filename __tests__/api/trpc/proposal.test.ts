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

vi.mock('@/lib/proposal/data/sanity', () => ({
  getProposal: vi.fn(),
  getProposals: vi.fn(),
  createProposal: vi.fn(),
  updateProposal: vi.fn(),
  deleteProposal: vi.fn(),
  updateProposalStatus: vi.fn(),
}))

vi.mock('@/lib/proposal/server', () => ({
  updateProposalStatus: vi.fn(),
  getProposalSanity: vi.fn(),
}))

vi.mock('@/lib/conference/state', () => ({
  isCfpOpen: vi.fn(),
  isConferenceOver: vi.fn(),
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
} from '@/lib/proposal/data/sanity'
import { getProposalSanity, updateProposalStatus } from '@/lib/proposal/server'
import { isCfpOpen } from '@/lib/conference/state'
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
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
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
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
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

    it('should allow speaker to unsubmit their proposal', async () => {
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
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('should return NOT_FOUND for nonexistent proposal', async () => {
      vi.mocked(getProposalSanity).mockResolvedValue({
        proposal: null as any,
        proposalError: null,
      })

      const caller = createAuthenticatedCaller(regularSpeaker._id)
      await expect(
        caller.proposal.action({ id: 'nonexistent', action: Action.withdraw }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })
  })
})
