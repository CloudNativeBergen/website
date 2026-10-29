import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appRouter } from '@/server/_app'
import { getProposal, getProposals } from '@/lib/proposal/data/sanity'
import { clientWrite } from '@/lib/sanity/client'
import { Status, Format } from '@/lib/proposal/types'
import { createNotifications } from '@/lib/notification/sanity'
import { addMessage, getConversationById } from '@/lib/messaging/sanity'
import { notifyNewMessage } from '@/lib/messaging/notify'
import { sendCoSpeakerRemovedEmail } from '@/lib/cospeaker/server'
import { notifySpeakerRemoved } from '@/lib/slack/notify'
import { speakers } from '../../helpers/trpc'

const { mockTransaction } = vi.hoisted(() => ({
  mockTransaction: {
    patch: vi.fn().mockReturnThis(),
    commit: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(() => mockTransaction),
  },
}))
vi.mock('@/lib/proposal/data/sanity')
vi.mock('@/lib/cospeaker/sanity')
vi.mock('@/lib/cospeaker/server')
vi.mock('@/lib/slack/notify')
vi.mock('@/lib/feedback/server')
vi.mock('@/lib/messaging/notify')
vi.mock('@/lib/notification/sanity')
vi.mock('@/lib/messaging/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ensureProposalConversation: vi.fn().mockResolvedValue('conv-1'),
  addMessage: vi.fn().mockResolvedValue({ _id: 'msg-1' }),
  getConversationById: vi.fn().mockResolvedValue({ _id: 'conv-1' }),
  syncProposalConversationParticipants: vi.fn().mockResolvedValue(undefined),
}))
// Run deferred work inline so the test can assert on it.
vi.mock('@/server/runAfterResponse', () => ({
  runAfterResponse: (task: () => Promise<void>) => task(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn().mockResolvedValue({
    conference: {
      _id: 'conf-1',
      title: 'Test Conf',
      organizer: 'Test Org',
      cfpEmail: 'cfp@test.com',
      organization: { _type: 'reference', _ref: 'org-test' },
    },
    domain: 'test.com',
    error: null,
  }),
}))

const regularSpeaker = speakers.find((s) => !s.isOrganizer)!
const organizerSpeaker = speakers.find((s) => s.isOrganizer)!
const coSpeaker = { _id: 'cospeaker-1', name: 'Co Speaker', email: 'co@x.no' }

const proposal = (overrides: Record<string, unknown> = {}) => ({
  _id: 'proposal-1',
  _rev: 'rev-1',
  title: 'Test Talk',
  status: Status.confirmed,
  format: Format.presentation_45,
  conference: { _id: 'conf-1' },
  _organizationId: 'org-test',
  speakers: [
    { _id: regularSpeaker._id, name: 'Primary', email: 'p@x.no' },
    coSpeaker,
  ],
  ...overrides,
})

const callerFor = (speaker: any) =>
  appRouter.createCaller({
    session: { user: { email: speaker.email }, speaker },
    speaker,
    user: { email: speaker.email },
  } as any)

const remove = (speaker: any, input: Record<string, unknown> = {}) =>
  callerFor(speaker).proposal.admin.removeSpeaker({
    proposalId: 'proposal-1',
    speakerId: coSpeaker._id,
    ...input,
  })

describe('proposal.admin.removeSpeaker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getProposal).mockResolvedValue({
      proposal: proposal() as any,
      proposalError: null,
    })
    vi.mocked(getProposals).mockResolvedValue({
      proposals: [],
      proposalsError: null,
    } as any)
  })

  it('refuses a non-organizer', async () => {
    await expect(remove(regularSpeaker)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(mockTransaction.commit).not.toHaveBeenCalled()
  })

  it('refuses a talk outside the request org', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: proposal({ _organizationId: 'org-other' }) as any,
      proposalError: null,
    })
    await expect(remove(organizerSpeaker)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(mockTransaction.commit).not.toHaveBeenCalled()
  })

  it('refuses to remove the last speaker', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: proposal({ speakers: [coSpeaker] }) as any,
      proposalError: null,
    })
    await expect(remove(organizerSpeaker)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(mockTransaction.commit).not.toHaveBeenCalled()
  })

  it('removes the primary speaker by unsetting its ref in place', async () => {
    await remove(organizerSpeaker, { speakerId: regularSpeaker._id })
    const call = mockTransaction.patch.mock.calls.find(
      (c) => c[0] === 'proposal-1',
    )!
    const builder = {
      ifRevisionId: vi.fn().mockReturnThis(),
      unset: vi.fn().mockReturnThis(),
    }
    call[1](builder)
    // Unsetting speakers[0] in place leaves the next speaker first.
    expect(builder.unset).toHaveBeenCalledWith([
      `speakers[_ref=="${regularSpeaker._id}"]`,
    ])
    expect(builder.ifRevisionId).toHaveBeenCalledWith('rev-1')
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1)
  })

  it('answers CONFLICT when the talk changed since it was read', async () => {
    mockTransaction.commit.mockRejectedValueOnce(
      Object.assign(new Error('revision mismatch'), { statusCode: 409 }),
    )
    await expect(remove(organizerSpeaker)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(addMessage).not.toHaveBeenCalled()
  })

  it('refuses a talk from another conference edition', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: proposal({ conference: { _id: 'conf-old' } }) as any,
      proposalError: null,
    })
    await expect(remove(organizerSpeaker)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(mockTransaction.commit).not.toHaveBeenCalled()
  })

  it('posts to the thread and tells the removed speaker and Slack', async () => {
    await remove(organizerSpeaker, { comment: ' Family matters ' })
    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Co Speaker is no longer a speaker on this talk.\n\nFamily matters',
        origin: 'system',
        category: 'proposal_status',
      }),
    )
    expect(getConversationById).toHaveBeenCalledWith('conv-1')
    expect(notifyNewMessage).toHaveBeenCalled()
    expect(createNotifications).toHaveBeenCalledWith([
      expect.objectContaining({
        recipientId: coSpeaker._id,
        message: 'Family matters',
      }),
    ])
    expect(sendCoSpeakerRemovedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: 'co@x.no',
        comment: 'Family matters',
      }),
    )
    expect(notifySpeakerRemoved).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'Co Speaker',
      'Primary',
      'Family matters',
      undefined,
    )
  })

  it('marks the stock removal notice as system Proposal status', async () => {
    await remove(organizerSpeaker)
    expect(addMessage).toHaveBeenCalledExactlyOnceWith({
      conversationId: 'conv-1',
      authorId: organizerSpeaker._id,
      body: 'Co Speaker is no longer a speaker on this talk.',
      origin: 'system',
      category: 'proposal_status',
    })
  })

  it('does not email or notify an organizer removing themselves', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: proposal({
        speakers: [
          { _id: organizerSpeaker._id, name: 'Org' },
          { _id: regularSpeaker._id, name: 'Primary' },
        ],
      }) as any,
      proposalError: null,
    })
    await remove(organizerSpeaker, {
      speakerId: organizerSpeaker._id,
      revokeTicket: true,
    })
    expect(createNotifications).not.toHaveBeenCalled()
    expect(sendCoSpeakerRemovedEmail).not.toHaveBeenCalled()
    expect(vi.mocked(notifySpeakerRemoved).mock.calls[0][5]).toBeUndefined()
  })

  it('lists the ticket to cancel for a confirmed talk', async () => {
    await remove(organizerSpeaker, { revokeTicket: true })
    expect(vi.mocked(notifySpeakerRemoved).mock.calls[0][5]).toEqual({
      speakers: [{ name: 'Co Speaker', email: 'co@x.no' }],
      unfiltered: false,
    })
  })

  it('keeps the ticket of a speaker with another confirmed talk', async () => {
    vi.mocked(getProposals).mockResolvedValue({
      proposals: [{ _id: 'other', speakers: [{ _ref: coSpeaker._id }] }],
      proposalsError: null,
    } as any)
    await remove(organizerSpeaker, { revokeTicket: true })
    expect(vi.mocked(notifySpeakerRemoved).mock.calls[0][5]?.speakers).toEqual(
      [],
    )
  })

  it('asks for no ticket cancel on an accepted talk', async () => {
    vi.mocked(getProposal).mockResolvedValue({
      proposal: proposal({ status: Status.accepted }) as any,
      proposalError: null,
    })
    await remove(organizerSpeaker, { revokeTicket: true })
    expect(vi.mocked(notifySpeakerRemoved).mock.calls[0][5]).toBeUndefined()
  })
})
