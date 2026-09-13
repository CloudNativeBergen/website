import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAdminCaller } from '../../helpers/trpc'
import { clientWrite } from '@/lib/sanity/client'
import { updateProposal } from '@/lib/proposal/data/sanity'
import { Audience, Format, Language, Level, Status } from '@/lib/proposal/types'

const { mockTransaction } = vi.hoisted(() => ({
  mockTransaction: {
    patch: vi.fn().mockReturnThis(),
    commit: vi.fn().mockResolvedValue({}),
  },
}))

vi.mock('@/lib/auth', () => ({ getAuthSession: vi.fn() }))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(() => mockTransaction),
    delete: vi.fn().mockResolvedValue({}),
  },
}))
vi.mock('@/lib/proposal/data/sanity')
// The tenancy waist reads Sanity directly; the guards themselves have their own
// tests, this one is about what `admin.update` does AFTER they pass.
vi.mock('@/server/tenancy', () => ({
  requireDocumentInCurrentOrg: vi.fn().mockResolvedValue('org-test'),
  requireDocumentsInCurrentOrg: vi.fn().mockResolvedValue(undefined),
  requireSpeakersInCurrentOrg: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/messaging/sanity', () => ({
  ensureProposalConversation: vi.fn().mockResolvedValue(null),
  syncProposalConversationParticipants: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: vi.fn().mockResolvedValue(undefined),
  deleteMessageNotificationsFor: vi.fn().mockResolvedValue(0),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn().mockResolvedValue({
    conference: {
      _id: 'conf-1',
      title: 'Test Conf',
      organizer: 'Test Org',
      organization: { _type: 'reference', _ref: 'org-test' },
    },
    domain: 'test.com',
    error: null,
  }),
}))

const PRIMARY = 'speaker-primary'
const CO = 'cospeaker-1'

const updatePayload = {
  title: 'Test Proposal',
  description: [
    {
      _type: 'block',
      _key: 'b1',
      style: 'normal',
      children: [{ _type: 'span', _key: 's1', text: 'A description.' }],
    },
  ],
  format: Format.presentation_45,
  language: Language.english,
  level: Level.intermediate,
  audiences: [Audience.developer],
  outline: 'outline',
  tos: true,
  status: Status.submitted,
}

/**
 * `admin.update` reads the pre-update speakers[] with a projection query and
 * then looks up accepted invitations per removed speaker. Route both off the
 * single `clientWrite.fetch` mock.
 */
function mockFetch({
  previousSpeakerIds,
  invitationsBySpeaker = {},
}: {
  previousSpeakerIds: string[]
  invitationsBySpeaker?: Record<string, string[]>
}) {
  vi.mocked(clientWrite.fetch).mockImplementation(
    (async (query: string, params: Record<string, string> = {}) => {
      if (query.includes('speakers[]._ref')) return previousSpeakerIds
      if (query.includes('coSpeakerInvitation')) {
        return invitationsBySpeaker[params.speakerId] ?? []
      }
      return []
    }) as never,
  )
}

describe('proposal.admin.update co-speaker reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updateProposal).mockResolvedValue({
      proposal: { _id: 'proposal-1' } as never,
      err: null as never,
    })
  })

  it('cancels the accepted invitation of a speaker dropped from speakers[]', async () => {
    mockFetch({
      previousSpeakerIds: [PRIMARY, CO],
      invitationsBySpeaker: { [CO]: ['inv-1'] },
    })

    await createAdminCaller().proposal.admin.update({
      id: 'proposal-1',
      data: { ...updatePayload, speakers: [PRIMARY] },
    })

    // Only the dropped speaker's invitations are looked up
    expect(clientWrite.fetch).toHaveBeenCalledWith(
      expect.stringContaining('coSpeakerInvitation'),
      { proposalId: 'proposal-1', speakerId: CO },
    )

    expect(mockTransaction.patch).toHaveBeenCalledWith(
      'inv-1',
      expect.any(Function),
    )
    const builder = { set: vi.fn().mockReturnThis() }
    mockTransaction.patch.mock.calls.find((c) => c[0] === 'inv-1')![1](builder)
    expect(builder.set).toHaveBeenCalledWith({ status: 'canceled' })
    expect(mockTransaction.commit).toHaveBeenCalledTimes(1)

    const { deleteMessageNotificationsFor } =
      await import('@/lib/notification/sanity')
    expect(deleteMessageNotificationsFor).toHaveBeenCalledWith({
      proposalIds: ['proposal-1'],
      speakerId: CO,
    })
  })

  it('leaves invitations alone when no speaker was dropped', async () => {
    mockFetch({
      previousSpeakerIds: [PRIMARY, CO],
      invitationsBySpeaker: { [CO]: ['inv-1'] },
    })

    await createAdminCaller().proposal.admin.update({
      id: 'proposal-1',
      data: { ...updatePayload, speakers: [PRIMARY, CO] },
    })

    expect(clientWrite.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('coSpeakerInvitation'),
      expect.anything(),
    )
    expect(clientWrite.transaction).not.toHaveBeenCalled()

    const { deleteMessageNotificationsFor } =
      await import('@/lib/notification/sanity')
    expect(deleteMessageNotificationsFor).not.toHaveBeenCalled()
  })
})
