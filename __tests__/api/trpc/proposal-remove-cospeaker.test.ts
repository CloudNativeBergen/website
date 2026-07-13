import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getProposal } from '@/lib/proposal/data/sanity'
import { clientWrite } from '@/lib/sanity/client'
import { Status, Format } from '@/lib/proposal/types'
import { speakers } from '../../helpers/trpc'

const { mockPatchChain, mockTransaction } = vi.hoisted(() => {
  const mockPatchChain = {
    set: vi.fn().mockReturnThis(),
    setIfMissing: vi.fn().mockReturnThis(),
    unset: vi.fn().mockReturnThis(),
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
    fetch: vi.fn().mockResolvedValue([]),
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
const organizerSpeaker = speakers.find((s) => s.isOrganizer)!

const coSpeaker = {
  _id: 'cospeaker-1',
  name: 'Co Speaker',
  email: 'cospeaker@test.com',
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
    coSpeaker,
  ],
  coSpeakerInvitations: [],
}

// Builds a patch spy and replays the recorded patch callback for a
// given document id from the transaction mock
function replayPatch(documentId: string) {
  const call = mockTransaction.patch.mock.calls.find((c) => c[0] === documentId)
  expect(call).toBeDefined()
  const builder = {
    set: vi.fn().mockReturnThis(),
    setIfMissing: vi.fn().mockReturnThis(),
    unset: vi.fn().mockReturnThis(),
    append: vi.fn().mockReturnThis(),
  }
  call![1](builder)
  return builder
}

describe('proposal.removeCoSpeaker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(clientWrite.fetch).mockResolvedValue([] as never)
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

  it('removes the speaker and cancels their accepted invitation in one transaction', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: mockProposal as any,
      proposalError: null,
    })
    vi.mocked(clientWrite.fetch).mockResolvedValue(['inv-1'] as never)

    const caller = createCaller(regularSpeaker)
    const result = await caller.proposal.removeCoSpeaker({
      proposalId: 'proposal-1',
      speakerId: coSpeaker._id,
    })

    expect(result).toEqual({ success: true })

    // Accepted invitations for this speaker are looked up via GROQ
    expect(clientWrite.fetch).toHaveBeenCalledWith(
      expect.stringContaining('coSpeakerInvitation'),
      { proposalId: 'proposal-1', speakerId: coSpeaker._id },
    )

    // Both writes happen in a single transaction
    expect(clientWrite.transaction).toHaveBeenCalledTimes(1)
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1)

    // The speaker reference is removed via a JSONMatch unset path
    const proposalPatch = replayPatch('proposal-1')
    expect(proposalPatch.unset).toHaveBeenCalledWith([
      `speakers[_ref=="${coSpeaker._id}"]`,
    ])

    // The accepted invitation is set to canceled in the same transaction
    const invitationPatch = replayPatch('inv-1')
    expect(invitationPatch.set).toHaveBeenCalledWith({ status: 'canceled' })
  })

  it('removes the speaker without invitation patches when no accepted invitation exists', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: mockProposal as any,
      proposalError: null,
    })
    vi.mocked(clientWrite.fetch).mockResolvedValue([] as never)

    const caller = createCaller(regularSpeaker)
    const result = await caller.proposal.removeCoSpeaker({
      proposalId: 'proposal-1',
      speakerId: coSpeaker._id,
    })

    expect(result).toEqual({ success: true })
    expect(mockTransaction.patch).toHaveBeenCalledTimes(1)
    expect(mockTransaction.patch).toHaveBeenCalledWith(
      'proposal-1',
      expect.any(Function),
    )
    expect(mockTransaction.commit).toHaveBeenCalled()
  })

  it('allows an organizer to remove a speaker from any proposal', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: mockProposal as any,
      proposalError: null,
    })

    const caller = createCaller(organizerSpeaker)
    const result = await caller.proposal.removeCoSpeaker({
      proposalId: 'proposal-1',
      speakerId: coSpeaker._id,
    })

    expect(result).toEqual({ success: true })
    expect(getProposal).toHaveBeenCalledWith(
      expect.objectContaining({ isOrganizer: true }),
    )
    expect(mockTransaction.commit).toHaveBeenCalled()
  })

  it('rejects callers who are not a speaker on the proposal', async () => {
    // getProposal scopes the query to the caller, so a non-owner gets
    // no proposal back
    vi.mocked(getProposal).mockResolvedValue({
      proposal: null as any,
      proposalError: null,
    })

    const caller = createCaller(regularSpeaker)
    await expect(
      caller.proposal.removeCoSpeaker({
        proposalId: 'proposal-1',
        speakerId: coSpeaker._id,
      }),
    ).rejects.toThrow(/not found or you do not have permission/)
    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  it('rejects a non-organizer removing the primary speaker (speakers[0])', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: mockProposal as any,
      proposalError: null,
    })

    // The co-speaker tries to remove the proposal's author
    const caller = createCaller(coSpeaker)
    await expect(
      caller.proposal.removeCoSpeaker({
        proposalId: 'proposal-1',
        speakerId: regularSpeaker._id!,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining('The primary speaker cannot be removed'),
    })
    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  it('allows an organizer to remove the primary speaker when they are not the last speaker', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: mockProposal as any,
      proposalError: null,
    })

    const caller = createCaller(organizerSpeaker)
    const result = await caller.proposal.removeCoSpeaker({
      proposalId: 'proposal-1',
      speakerId: regularSpeaker._id!,
    })

    expect(result).toEqual({ success: true })
    const proposalPatch = replayPatch('proposal-1')
    expect(proposalPatch.unset).toHaveBeenCalledWith([
      `speakers[_ref=="${regularSpeaker._id}"]`,
    ])
    expect(mockTransaction.commit).toHaveBeenCalled()
  })

  it('tolerates dangling (null) speaker references when removing a co-speaker', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: {
        ...mockProposal,
        speakers: [mockProposal.speakers[0], null, coSpeaker],
      } as any,
      proposalError: null,
    })

    const caller = createCaller(regularSpeaker)
    const result = await caller.proposal.removeCoSpeaker({
      proposalId: 'proposal-1',
      speakerId: coSpeaker._id,
    })

    expect(result).toEqual({ success: true })
    expect(mockTransaction.commit).toHaveBeenCalled()
  })

  it('rejects self-removal for non-organizers', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: mockProposal as any,
      proposalError: null,
    })

    const caller = createCaller(regularSpeaker)
    await expect(
      caller.proposal.removeCoSpeaker({
        proposalId: 'proposal-1',
        speakerId: regularSpeaker._id!,
      }),
    ).rejects.toThrow(/cannot remove yourself/)
    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  it('rejects removing the only speaker on the proposal', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: { ...mockProposal, speakers: [coSpeaker] } as any,
      proposalError: null,
    })

    const caller = createCaller(organizerSpeaker)
    await expect(
      caller.proposal.removeCoSpeaker({
        proposalId: 'proposal-1',
        speakerId: coSpeaker._id,
      }),
    ).rejects.toThrow(/at least one speaker/)
    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  it('rejects removing someone who is not a speaker on the proposal', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: mockProposal as any,
      proposalError: null,
    })

    const caller = createCaller(regularSpeaker)
    await expect(
      caller.proposal.removeCoSpeaker({
        proposalId: 'proposal-1',
        speakerId: 'unknown-speaker',
      }),
    ).rejects.toThrow(/not currently a speaker/)
    expect(clientWrite.transaction).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated requests', async () => {
    const caller = appRouter.createCaller({
      session: null,
      speaker: undefined,
      user: undefined,
    } as any)

    await expect(
      caller.proposal.removeCoSpeaker({
        proposalId: 'proposal-1',
        speakerId: coSpeaker._id,
      }),
    ).rejects.toThrow()
  })
})
