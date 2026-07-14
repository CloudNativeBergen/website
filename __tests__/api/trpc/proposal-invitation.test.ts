import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getProposal } from '@/lib/proposal/data/sanity'
import { getInvitationByToken } from '@/lib/cospeaker/sanity'
import {
  createCoSpeakerInvitation,
  sendInvitationEmail,
  sendResponseNotificationEmail,
} from '@/lib/cospeaker/server'
import { clientWrite } from '@/lib/sanity/client'
import { Status, Format } from '@/lib/proposal/types'
import { speakers } from '../../helpers/trpc'

const { mockPatchChain, mockTransaction } = vi.hoisted(() => {
  const mockPatchChain = {
    set: vi.fn().mockReturnThis(),
    setIfMissing: vi.fn().mockReturnThis(),
    append: vi.fn().mockReturnThis(),
    commit: vi.fn().mockResolvedValue({}),
  }
  const mockTransaction = {
    patch: vi.fn().mockReturnThis(),
    commit: vi.fn().mockResolvedValue({}),
  }
  return { mockPatchChain, mockTransaction }
})

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(),
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    patch: vi.fn(() => mockPatchChain),
    transaction: vi.fn(() => mockTransaction),
    delete: vi.fn().mockResolvedValue({}),
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
  format: Format.presentation_45,
  conference: { _id: 'conf-1' },
  speakers: [
    {
      _id: regularSpeaker._id,
      name: regularSpeaker.name,
      email: regularSpeaker.email,
    },
  ],
  coSpeakerInvitations: [],
}

// Matches the real getInvitationByToken projection, which dereferences
// the proposal: proposal-> { _id, title, format, status }
const mockInvitation = {
  _id: 'inv-1',
  invitedEmail: 'invited@test.com',
  status: 'pending',
  proposal: {
    _id: 'proposal-1',
    title: 'Test Proposal',
    format: Format.presentation_45,
    status: Status.submitted,
  },
  invitedBy: {
    _id: regularSpeaker._id,
    name: regularSpeaker.name,
    email: regularSpeaker.email,
  },
  expiresAt: new Date(Date.now() + 100000).toISOString(),
}

describe('proposal.invitation router', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // respond fires the notification email without awaiting it, chaining
    // .catch() on the returned promise — the mock must return one
    vi.mocked(sendResponseNotificationEmail).mockResolvedValue(true)
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

    it('should not leak the invitation bearer token to the inviter (regression)', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(createCoSpeakerInvitation).mockResolvedValue({
        ...mockInvitation,
        token: 'super-secret-token',
      } as any)
      vi.mocked(sendInvitationEmail).mockResolvedValue(true)

      const caller = createCaller(regularSpeaker)
      const result = await caller.proposal.invitation.send({
        proposalId: 'proposal-1',
        invitedEmail: 'invited@test.com',
        invitedName: 'Invited Co-Speaker',
      })

      // The mutation response must never contain the bearer token; only
      // the invitee receives it, via the emailed invitation link
      expect(result).not.toHaveProperty('token')
      expect(JSON.stringify(result)).not.toContain('super-secret-token')

      // The email flow still receives the full invitation with the token
      expect(sendInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'super-secret-token' }),
      )
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

    it('should reject invitations on lightning talks (no co-speakers allowed)', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: {
          ...mockProposal,
          format: Format.lightning_10,
        } as any,
        proposalError: null,
      })

      const caller = createCaller(regularSpeaker)
      await expect(
        caller.proposal.invitation.send({
          proposalId: 'proposal-1',
          invitedEmail: 'invited@test.com',
        }),
      ).rejects.toThrow(/does not allow co-speakers/)
      expect(createCoSpeakerInvitation).not.toHaveBeenCalled()
    })

    it('should reject when the co-speaker limit is reached by existing speakers', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: {
          ...mockProposal,
          format: Format.presentation_20, // limit: 1 co-speaker
          speakers: [
            { _id: regularSpeaker._id, email: regularSpeaker.email },
            { _id: 'cospeaker-1', email: 'existing-cospeaker@test.com' },
          ],
        } as any,
        proposalError: null,
      })

      const caller = createCaller(regularSpeaker)
      await expect(
        caller.proposal.invitation.send({
          proposalId: 'proposal-1',
          invitedEmail: 'invited@test.com',
        }),
      ).rejects.toThrow(/allows at most 1 co-speaker/)
      expect(createCoSpeakerInvitation).not.toHaveBeenCalled()
    })

    it('should count pending invitations toward the co-speaker limit', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: {
          ...mockProposal,
          format: Format.presentation_20, // limit: 1 co-speaker
          coSpeakerInvitations: [
            {
              _id: 'inv-other',
              invitedEmail: 'someone-else@test.com',
              status: 'pending',
            },
          ],
        } as any,
        proposalError: null,
      })

      const caller = createCaller(regularSpeaker)
      await expect(
        caller.proposal.invitation.send({
          proposalId: 'proposal-1',
          invitedEmail: 'invited@test.com',
        }),
      ).rejects.toThrow(/allows at most 1 co-speaker/)
      expect(createCoSpeakerInvitation).not.toHaveBeenCalled()
    })

    it('should reject a duplicate pending invitation for the same email (case-insensitive)', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: {
          ...mockProposal,
          coSpeakerInvitations: [
            {
              _id: 'inv-existing',
              invitedEmail: 'Invited@Test.com',
              status: 'pending',
            },
          ],
        } as any,
        proposalError: null,
      })

      const caller = createCaller(regularSpeaker)
      await expect(
        caller.proposal.invitation.send({
          proposalId: 'proposal-1',
          invitedEmail: 'invited@test.com',
        }),
      ).rejects.toThrow(/pending invitation already exists/)
      expect(createCoSpeakerInvitation).not.toHaveBeenCalled()
    })

    it('should reject inviting yourself', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })

      const caller = createCaller(regularSpeaker)
      await expect(
        caller.proposal.invitation.send({
          proposalId: 'proposal-1',
          invitedEmail: regularSpeaker.email!.toUpperCase(),
        }),
      ).rejects.toThrow(/cannot invite yourself/)
      expect(createCoSpeakerInvitation).not.toHaveBeenCalled()
    })

    it('should reject inviting someone who is already a speaker on the proposal', async () => {
      vi.mocked(getProposal).mockResolvedValue({
        proposal: {
          ...mockProposal,
          speakers: [
            {
              _id: regularSpeaker._id,
              name: regularSpeaker.name,
              email: regularSpeaker.email,
            },
            {
              _id: 'cospeaker-1',
              name: 'Existing Co-Speaker',
              email: 'invited@test.com',
            },
          ],
        } as any,
        proposalError: null,
      })

      const caller = createCaller(regularSpeaker)
      await expect(
        caller.proposal.invitation.send({
          proposalId: 'proposal-1',
          invitedEmail: 'invited@test.com',
        }),
      ).rejects.toThrow(/already a speaker/)
      expect(createCoSpeakerInvitation).not.toHaveBeenCalled()
    })

    it('should reject invitations on rejected/withdrawn/deleted proposals', async () => {
      for (const status of [
        Status.rejected,
        Status.withdrawn,
        Status.deleted,
      ]) {
        vi.mocked(getProposal).mockResolvedValue({
          proposal: { ...mockProposal, status } as any,
          proposalError: null,
        })

        const caller = createCaller(regularSpeaker)
        await expect(
          caller.proposal.invitation.send({
            proposalId: 'proposal-1',
            invitedEmail: 'invited@test.com',
          }),
        ).rejects.toThrow(new RegExp(`has been ${status}`))
      }
      expect(createCoSpeakerInvitation).not.toHaveBeenCalled()
    })
  })

  describe('respond', () => {
    it('should allow accepting an invitation and atomically add the speaker to the proposal', async () => {
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
      expect(result.status).toBe('accepted')

      // Speaker append and invitation update happen in one transaction
      expect(clientWrite.transaction).toHaveBeenCalled()
      expect(mockTransaction.commit).toHaveBeenCalled()

      // Regression (bug fix): the co-speaker must be appended to
      // talk.speakers using the dereferenced proposal _id
      const speakerPatchCall = mockTransaction.patch.mock.calls.find(
        (call) => call[0] === 'proposal-1',
      )
      expect(speakerPatchCall).toBeDefined()
      const speakerPatchBuilder = {
        setIfMissing: vi.fn().mockReturnThis(),
        append: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
      }
      speakerPatchCall![1](speakerPatchBuilder)
      expect(speakerPatchBuilder.setIfMissing).toHaveBeenCalledWith({
        speakers: [],
      })
      expect(speakerPatchBuilder.append).toHaveBeenCalledWith('speakers', [
        expect.objectContaining({
          _type: 'reference',
          _ref: invitedSpeaker._id,
          _key: expect.any(String),
        }),
      ])

      // Invitation marked accepted in the same transaction
      const invitationPatchCall = mockTransaction.patch.mock.calls.find(
        (call) => call[0] === 'inv-1',
      )
      expect(invitationPatchCall).toBeDefined()
      const invitationPatchBuilder = {
        setIfMissing: vi.fn().mockReturnThis(),
        append: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
      }
      invitationPatchCall![1](invitationPatchBuilder)
      expect(invitationPatchBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'accepted',
          acceptedSpeaker: expect.objectContaining({
            _ref: invitedSpeaker._id,
          }),
        }),
      )

      // Inviter is notified of the acceptance
      expect(sendResponseNotificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          accepted: true,
          respondentEmail: invitedSpeaker.email,
        }),
      )
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

    it('should reject an expired invitation and mark it expired', async () => {
      vi.mocked(getInvitationByToken).mockResolvedValue({
        ...mockInvitation,
        expiresAt: new Date(Date.now() - 100000).toISOString(),
      } as any)

      const caller = createCaller(invitedSpeaker)
      await expect(
        caller.proposal.invitation.respond({
          token: 'valid-token',
          accept: true,
        }),
      ).rejects.toThrow(/has expired/)

      // The invitation is patched to expired server-side
      expect(clientWrite.patch).toHaveBeenCalledWith('inv-1')
      expect(mockPatchChain.set).toHaveBeenCalledWith({ status: 'expired' })
      expect(mockPatchChain.commit).toHaveBeenCalled()

      // No speaker was added
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })

    it('should block accepting when the proposal has been rejected', async () => {
      vi.mocked(getInvitationByToken).mockResolvedValue(mockInvitation as any)
      vi.mocked(getProposal).mockResolvedValue({
        proposal: { ...mockProposal, status: Status.rejected } as any,
        proposalError: null,
      })

      const caller = createCaller(invitedSpeaker)
      await expect(
        caller.proposal.invitation.respond({
          token: 'valid-token',
          accept: true,
        }),
      ).rejects.toThrow(/proposal has been rejected/)
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })

    it('should block accepting when the proposal no longer exists', async () => {
      vi.mocked(getInvitationByToken).mockResolvedValue({
        ...mockInvitation,
        proposal: null,
      } as any)

      const caller = createCaller(invitedSpeaker)
      await expect(
        caller.proposal.invitation.respond({
          token: 'valid-token',
          accept: true,
        }),
      ).rejects.toThrow(/no longer exists/)
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })

    it('should allow declining and notify the inviter', async () => {
      vi.mocked(getInvitationByToken).mockResolvedValue(mockInvitation as any)

      const caller = createCaller(invitedSpeaker)
      const result = await caller.proposal.invitation.respond({
        token: 'valid-token',
        accept: false,
        declineReason: 'Schedule conflict',
      })

      expect(result.success).toBe(true)
      expect(result.status).toBe('declined')

      // The decline is a single atomic patch carrying status,
      // respondedAt and the decline reason together
      expect(clientWrite.patch).toHaveBeenCalledTimes(1)
      expect(clientWrite.patch).toHaveBeenCalledWith('inv-1')
      expect(mockPatchChain.set).toHaveBeenCalledTimes(1)
      expect(mockPatchChain.set).toHaveBeenCalledWith({
        status: 'declined',
        respondedAt: expect.any(String),
        declineReason: 'Schedule conflict',
      })
      expect(mockPatchChain.commit).toHaveBeenCalledTimes(1)

      expect(sendResponseNotificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          accepted: false,
          respondentEmail: invitedSpeaker.email,
          declineReason: 'Schedule conflict',
        }),
      )
    })

    it('should omit declineReason from the decline patch when none is given', async () => {
      vi.mocked(getInvitationByToken).mockResolvedValue(mockInvitation as any)

      const caller = createCaller(invitedSpeaker)
      const result = await caller.proposal.invitation.respond({
        token: 'valid-token',
        accept: false,
      })

      expect(result.status).toBe('declined')
      expect(mockPatchChain.set).toHaveBeenCalledWith({
        status: 'declined',
        respondedAt: expect.any(String),
      })
    })

    it('should check ownership before expiry: a non-invitee must not trigger the expired write', async () => {
      vi.mocked(getInvitationByToken).mockResolvedValue({
        ...mockInvitation,
        expiresAt: new Date(Date.now() - 100000).toISOString(),
      } as any)

      const wrongSpeaker = { _id: 'speaker-3', email: 'wrong@test.com' }
      const caller = createCaller(wrongSpeaker)

      await expect(
        caller.proposal.invitation.respond({
          token: 'valid-token',
          accept: true,
        }),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('different email address'),
      })

      // The invitation must not be marked expired for a caller who does
      // not own it, and no expiry state is revealed
      expect(clientWrite.patch).not.toHaveBeenCalled()
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })

    it('should not fail the mutation when the notification email fails (fire-and-forget)', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      vi.mocked(getInvitationByToken).mockResolvedValue(mockInvitation as any)
      vi.mocked(getProposal).mockResolvedValue({
        proposal: mockProposal as any,
        proposalError: null,
      })
      vi.mocked(sendResponseNotificationEmail).mockRejectedValue(
        new Error('email service down'),
      )

      const caller = createCaller(invitedSpeaker)
      const result = await caller.proposal.invitation.respond({
        token: 'valid-token',
        accept: true,
      })

      // The mutation resolves without waiting for the email promise
      expect(result.success).toBe(true)

      // Flush microtasks so the floating .catch() handler runs and the
      // rejection is logged instead of becoming unhandled
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to send co-speaker response notification email:',
        expect.any(Error),
      )
      consoleErrorSpy.mockRestore()
    })
  })
})
