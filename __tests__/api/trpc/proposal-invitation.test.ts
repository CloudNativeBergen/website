import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TRPCError } from '@trpc/server'
import { appRouter } from '@/server/_app'
import { getProposal, createProposal } from '@/lib/proposal/data/sanity'
import { getInvitationByToken } from '@/lib/cospeaker/sanity'
import {
  createCoSpeakerInvitation,
  updateInvitationStatus,
  sendInvitationEmail,
} from '@/lib/cospeaker/server'
import { clientWrite } from '@/lib/sanity/client'
import { createReferenceWithKey } from '@/lib/sanity/helpers'
import { Status } from '@/lib/proposal/types'
import { speakers } from '../../helpers/trpc'

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(),
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    patch: vi.fn().mockReturnValue({
      setIfMissing: vi.fn().mockReturnThis(),
      append: vi.fn().mockReturnThis(),
      commit: vi.fn().mockResolvedValue({}),
    }),
  },
}))
vi.mock('@/lib/proposal/data/sanity')
vi.mock('@/lib/cospeaker/sanity')
vi.mock('@/lib/cospeaker/server')
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn().mockResolvedValue({
    conference: {
      _id: 'conf-1',
      title: 'Test Conf',
      organizer: 'Test Org',
      cfpEmail: 'cfp@test.com',
    },
    domain: 'test.com',
  }),
}))

const regularSpeaker = speakers.find((s) => !s.isOrganizer)!
const invitedSpeaker = {
  _id: 'speaker-2',
  name: 'Invited Co-Speaker',
  email: 'invited@test.com',
}

const mockProposal = {
  _id: 'proposal-1',
  title: 'Test Proposal',
  status: Status.submitted,
  conference: { _id: 'conf-1' },
  speakers: [{ _id: regularSpeaker._id }],
}

const mockInvitation = {
  _id: 'inv-1',
  invitedEmail: 'invited@test.com',
  status: 'pending',
  proposal: { _ref: 'proposal-1' },
  invitedBy: { _id: regularSpeaker._id, name: regularSpeaker.name },
  expiresAt: new Date(Date.now() + 100000).toISOString(),
}

describe('proposal.invitation router', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createCaller = (speaker: any) => {
    const ctx = {
      session: {
        user: { email: speaker.email },
        speaker,
      },
      speaker,
      user: { email: speaker.email },
    }
    return appRouter.createCaller(ctx as any)
  }

  describe('send', () => {
    it('should allow a speaker to send an invitation', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(createCoSpeakerInvitation).mockResolvedValue({
        ...mockInvitation,
        _id: 'inv-1',
      } as any)
      vi.mocked(sendInvitationEmail).mockResolvedValue(true)

      const caller = createCaller(regularSpeaker)
      const result = await caller.proposal.invitation.send({
        proposalId: 'proposal-1',
        invitedEmail: 'invited@test.com',
        invitedName: 'Invited Co-Speaker',
      })

      expect(result).toBeDefined()
      expect(createCoSpeakerInvitation).toHaveBeenCalled()
      expect(sendInvitationEmail).toHaveBeenCalled()
    })

    it('should reject if user does not own the proposal', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: null as any,
        proposalError: null,
      })

      const caller = createCaller(regularSpeaker)
      await expect(
        caller.proposal.invitation.send({
          proposalId: 'proposal-1',
          invitedEmail: 'invited@test.com',
        }),
      ).rejects.toThrow(/Proposal not found/)
    })
  })

  describe('respond', () => {
    it('should allow accepting an invitation with the correct email', async () => {
      vi.mocked(getInvitationByToken).mockResolvedValue(mockInvitation as any)
      vi.mocked(getProposal).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createCaller(invitedSpeaker)
      const result = await caller.proposal.invitation.respond({
        token: 'valid-token',
        accept: true,
      })

      expect(result.success).toBe(true)
      expect(updateInvitationStatus).toHaveBeenCalledWith(
        'inv-1',
        'accepted',
        invitedSpeaker._id,
      )

      // Verify the speaker was added to the proposal with a key (bug fix)
      expect(clientWrite.patch).toHaveBeenCalledWith('proposal-1')
      expect(
        vi.mocked(clientWrite.patch('proposal-1').append),
      ).toHaveBeenCalledWith('speakers', [
        expect.objectContaining({ _key: expect.any(String) }),
      ])
    })

    it('should reject if the email does not match (bug fix)', async () => {
      vi.mocked(getInvitationByToken).mockResolvedValue(mockInvitation as any)

      const wrongSpeaker = { _id: 'speaker-3', email: 'wrong@test.com' }
      const caller = createCaller(wrongSpeaker)

      await expect(
        caller.proposal.invitation.respond({
          token: 'valid-token',
          accept: true,
        }),
      ).rejects.toThrow(/sent to a different email address/)
    })

    it('should reject if invitation is not pending', async () => {
      vi.mocked(getInvitationByToken).mockResolvedValue({
        ...mockInvitation,
        status: 'accepted',
      } as any)

      const caller = createCaller(invitedSpeaker)
      await expect(
        caller.proposal.invitation.respond({
          token: 'valid-token',
          accept: true,
        }),
      ).rejects.toThrow(/already been responded to/)
    })
  })
})
