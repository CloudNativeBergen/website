/**
 * @vitest-environment node
 *
 * A workshop's capacity changed from the proposal editor (#1344) takes the
 * same guarded write as the Workshops page: `changeCapacity`, which refuses
 * below the seats taken and confirms the longest-waiting into free seats. The
 * decision itself is proven on stored documents in
 * `src/lib/workshop/seats.sanity.test.ts`; here `seats` is mocked, and only the
 * router's use of it is under test.
 */

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  updateProposal: vi.fn(),
  getProposal: vi.fn(),
  createInvitation: vi.fn(),
  sendInvitationEmail: vi.fn(),
  currentSpeakerRefs: [] as string[],
  stored: { capacity: 10, conferenceId: 'conf-A' } as {
    capacity?: number
    conferenceId: string
  },
  changeCapacity: vi.fn(),
  emailPromoted: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/server/tenancy', () => ({
  requireDocumentInCurrentOrg: vi.fn().mockResolvedValue(undefined),
  requireDocumentsInCurrentOrg: vi.fn().mockResolvedValue(undefined),
  requireSpeakersInCurrentOrg: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/proposal/data/sanity', () => ({
  getProposal: h.getProposal,
  getProposals: vi.fn(),
  createProposal: vi.fn(),
  updateProposal: h.updateProposal,
  deleteProposal: vi.fn(),
  ProposalDeletionBlockedError: class extends Error {},
}))
vi.mock('@/lib/proposal/server', () => ({
  getProposalSanity: h.getProposal,
  getProposals: vi.fn(),
  updateProposalStatus: vi.fn(),
  fetchNextUnreviewedProposal: vi.fn(),
  searchProposals: vi.fn(),
}))
vi.mock('@/lib/messaging/sanity', () => ({
  ensureProposalConversation: vi.fn(),
  addMessage: vi.fn(),
  syncProposalConversationParticipants: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/cospeaker/server', () => ({
  createCoSpeakerInvitation: h.createInvitation,
  sendInvitationEmail: h.sendInvitationEmail,
  sendResponseNotificationEmail: vi.fn(),
}))
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: vi.fn(),
  deleteMessageNotificationsFor: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/sanity/client', () => {
  const client = {
    fetch: async (query: string) => {
      if (query.includes('"conferenceId": conference._ref')) return h.stored
      if (query.includes('speakers[]._ref')) return h.currentSpeakerRefs
      if (query.includes('topics[]._ref')) return []
      return []
    },
    transaction: () => ({ patch: vi.fn(), commit: vi.fn() }),
    patch: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  }
  return {
    clientRead: client,
    clientReadCached: client,
    clientReadUncached: client,
    clientWrite: client,
  }
})

vi.mock('@/lib/workshop/seats', () => ({
  changeCapacity: h.changeCapacity,
}))
vi.mock('@/lib/workshop/promoted', () => ({
  emailPromotedSignups: h.emailPromoted,
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'
import { proposalRouter } from './proposal'

const organizer = () => {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    email: 'admin@example.com',
    isOrganizer: true,
    organizerOrgIds: ['org-A'],
  }
  const user = { email: speaker.email }
  return proposalRouter.createCaller({
    session: { user, speaker },
    speaker,
    user,
  } as unknown as Context)
}

const conference = { _id: 'conf-A', organization: { _ref: 'org-A' } }

beforeEach(() => {
  vi.clearAllMocks()
  h.getConference.mockResolvedValue({ conference, error: null })
  h.updateProposal.mockResolvedValue({ proposal: { _id: 'talk-1' }, err: null })
  h.stored = { capacity: 10, conferenceId: 'conf-A' }
  h.changeCapacity.mockResolvedValue({ promoted: [] })
})

const update = (data: Record<string, unknown>) =>
  organizer().admin.update({ id: 'talk-1', data } as never)

describe('proposal.admin.update and a workshop capacity (#1344)', () => {
  it("a changed capacity is written through the seats guard of the talk's conference, not by the plain patch", async () => {
    await update({ title: 'Kubernetes hands-on', capacity: 12 })

    expect(h.changeCapacity).toHaveBeenCalledWith('talk-1', 'conf-A', 12)
    expect(h.updateProposal).toHaveBeenCalledWith('talk-1', {
      title: 'Kubernetes hands-on',
    })
  })

  it('emails the sign-ups it confirmed into the new seats', async () => {
    h.changeCapacity.mockResolvedValue({ promoted: ['s-1', 's-2'] })

    await update({ capacity: 12 })

    expect(h.emailPromoted).toHaveBeenCalledWith('conf-A', ['s-1', 's-2'])
  })

  it('an unchanged capacity takes no guarded write, and is not patched either', async () => {
    await update({ title: 'Kubernetes hands-on', capacity: 10 })

    expect(h.changeCapacity).not.toHaveBeenCalled()
    expect(h.updateProposal).toHaveBeenCalledWith('talk-1', {
      title: 'Kubernetes hands-on',
    })
  })

  it.each([
    [
      { refused: 'below-seats-taken', seatsTaken: 14 },
      'CONFLICT',
      'Cannot reduce capacity below current signup count (14)',
    ],
    [
      { refused: 'busy' },
      'TOO_MANY_REQUESTS',
      'Many people are signing up for this workshop right now. Nothing was saved. Try again in a moment.',
    ],
  ])(
    'refused %o: %s with a clear message, and nothing else is saved',
    async (answer, code, message) => {
      h.changeCapacity.mockResolvedValue(answer)

      await expect(
        update({ title: 'Kubernetes hands-on', capacity: 12 }),
      ).rejects.toMatchObject({ code, message })
      expect(h.updateProposal).not.toHaveBeenCalled()
    },
  )
})
