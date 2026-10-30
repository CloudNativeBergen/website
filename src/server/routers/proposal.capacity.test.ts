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
  lagging: null as null | { capacity?: number; conferenceId: string },
  stored: { capacity: 10, conferenceId: 'conf-A' } as {
    capacity?: number
    status?: string
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
      // A search-store read of the talk: it may lag (see the stale test).
      if (query.includes('"conferenceId": conference._ref')) {
        return h.lagging ?? h.stored
      }
      if (query.includes('speakers[]._ref')) return h.currentSpeakerRefs
      if (query.includes('topics[]._ref')) return []
      return []
    },
    // The doc endpoint: current.
    getDocument: async (id: string) => ({
      _id: id,
      capacity: h.stored.capacity,
      status: h.stored.status ?? 'confirmed',
      format: 'workshop_120',
      conference: { _ref: h.stored.conferenceId },
    }),
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
  deliverPromotionEmails: h.emailPromoted,
}))

import { revalidateTag } from 'next/cache'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'
import { proposalRouter } from './proposal'
import { requireSpeakersInCurrentOrg } from '@/server/tenancy'

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
  h.lagging = null
  h.changeCapacity.mockResolvedValue({ promoted: [] })
})

const update = (data: Record<string, unknown>) =>
  organizer().admin.update({ id: 'talk-1', data } as never)

describe('proposal.admin.update and a workshop capacity (#1344)', () => {
  it("expires the talk's public programme and speaker pages", async () => {
    h.updateProposal.mockResolvedValue({
      proposal: { _id: 'talk-1', conference: { _ref: 'conf-A' } },
      err: null,
    })
    await update({ title: 'Renamed' })
    expect(revalidateTag).toHaveBeenCalledWith(
      'sanity:conference-conf-A',
      'default',
    )
    expect(revalidateTag).toHaveBeenCalledWith('content:speakers', 'default')
  })

  it("a changed capacity is written through the seats guard of the talk's conference, not by the plain patch", async () => {
    await update({ title: 'Kubernetes hands-on', capacity: 12 })

    expect(h.changeCapacity).toHaveBeenCalledWith('talk-1', 'conf-A', 12, {
      edit: {},
    })
    expect(h.updateProposal).toHaveBeenCalledWith('talk-1', {
      title: 'Kubernetes hands-on',
    })
  })

  it('compares with the capacity stored now, not one a lagging read still shows', async () => {
    // Changed to 10 on the Workshops page a moment ago; a read still shows 20.
    h.lagging = { capacity: 20, conferenceId: 'conf-A' }

    await update({ capacity: 20 })

    expect(h.changeCapacity).toHaveBeenCalledWith('talk-1', 'conf-A', 20, {
      edit: {},
    })
  })

  it('an edit that also changes the format passes it on, for the seats module to judge with the talk as it is then', async () => {
    await update({ capacity: 12, format: 'presentation_40' })

    expect(h.changeCapacity).toHaveBeenCalledWith('talk-1', 'conf-A', 12, {
      edit: { format: 'presentation_40' },
    })
  })

  it('an edit that leaves status and format alone passes neither', async () => {
    await update({ capacity: 12 })

    expect(h.changeCapacity).toHaveBeenCalledWith('talk-1', 'conf-A', 12, {
      edit: {},
    })
  })

  it('emails the sign-ups it confirmed into the new seats', async () => {
    h.changeCapacity.mockResolvedValue({ promoted: ['s-1', 's-2'] })

    await update({ capacity: 12 })

    expect(h.emailPromoted).toHaveBeenCalledWith('conf-A', ['s-1', 's-2'])
  })

  it('an edit that turns a talk back into a confirmed workshop and raises its capacity: the promoted are emailed AFTER the proposal patch has committed (the sender judges the stored talk)', async () => {
    h.changeCapacity.mockResolvedValue({ promoted: ['s-1', 's-2'] })

    await update({ format: 'workshop_120', status: 'confirmed', capacity: 12 })

    expect(h.updateProposal).toHaveBeenCalledTimes(1)
    expect(h.emailPromoted).toHaveBeenCalledWith('conf-A', ['s-1', 's-2'])
    expect(h.updateProposal.mock.invocationCallOrder[0]).toBeLessThan(
      h.emailPromoted.mock.invocationCallOrder[0],
    )
  })

  it('the promoted are emailed LAST: after the conversation participants were synced for a speaker change', async () => {
    h.changeCapacity.mockResolvedValue({ promoted: ['s-1'] })
    const { syncProposalConversationParticipants } =
      await import('@/lib/messaging/sanity')

    await update({ capacity: 12, speakers: ['sp-1'] })

    expect(syncProposalConversationParticipants).toHaveBeenCalledTimes(1)
    expect(h.emailPromoted).toHaveBeenCalledTimes(1)
    expect(
      vi.mocked(syncProposalConversationParticipants).mock
        .invocationCallOrder[0],
    ).toBeLessThan(h.emailPromoted.mock.invocationCallOrder[0])
  })

  it('a proposal patch that fails after the capacity write: nothing is sent now (the debts stay owed for the cron)', async () => {
    h.changeCapacity.mockResolvedValue({ promoted: ['s-1'] })
    h.updateProposal.mockResolvedValue({
      proposal: null,
      err: new Error('503'),
    })

    await expect(update({ capacity: 12 })).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    })

    expect(h.emailPromoted).not.toHaveBeenCalled()
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

describe('a capacity change in an edit that is refused for another reason (#1344)', () => {
  it('a speaker the organizer may not add: nothing is written, the capacity neither', async () => {
    vi.mocked(requireSpeakersInCurrentOrg).mockRejectedValueOnce(
      new Error('speaker of another organization'),
    )

    await expect(
      update({ capacity: 12, speakers: ['sp-foreign'] }),
    ).rejects.toThrow()
    expect(h.changeCapacity).not.toHaveBeenCalled()
    expect(h.updateProposal).not.toHaveBeenCalled()
  })

  it('a workshop of another edition than the site’s: refused, so its promotions are never emailed in this edition’s name', async () => {
    h.stored = { capacity: 10, conferenceId: 'conf-2025' }

    await expect(update({ capacity: 12 })).rejects.toMatchObject({
      code: 'CONFLICT',
      message:
        'This workshop belongs to another edition. Change its capacity on that edition’s site.',
    })
    expect(h.changeCapacity).not.toHaveBeenCalled()
    expect(h.updateProposal).not.toHaveBeenCalled()
  })

  it('a capacity that is not a whole number is refused before any write', async () => {
    await expect(update({ capacity: 1.5 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    expect(h.changeCapacity).not.toHaveBeenCalled()
  })
})

describe('proposal.update by an organizer who speaks at the workshop (#1344)', () => {
  it('a changed capacity is written through the seats guard, not by the plain patch', async () => {
    h.getProposal.mockResolvedValue({
      proposal: {
        _id: 'talk-1',
        status: 'draft',
        format: 'workshop_120',
        capacity: 10,
        conference: { _id: 'conf-A' },
      },
      proposalError: null,
    })

    await organizer().update({
      id: 'talk-1',
      // As the CFP form sends it: the whole proposal, its format too.
      data: {
        title: 'Kubernetes hands-on',
        format: 'workshop_120',
        capacity: 12,
      },
    } as never)

    expect(h.changeCapacity).toHaveBeenCalledWith('talk-1', 'conf-A', 12, {
      edit: { format: 'workshop_120' },
    })
    expect(h.updateProposal).toHaveBeenCalledTimes(1)
    expect(h.updateProposal.mock.calls[0][1]).toMatchObject({
      title: 'Kubernetes hands-on',
    })
    expect(h.updateProposal.mock.calls[0][1]).not.toHaveProperty('capacity')
  })

  it('emails the promoted only after the proposal patch has committed, as the admin path does', async () => {
    h.getProposal.mockResolvedValue({
      proposal: {
        _id: 'talk-1',
        status: 'draft',
        format: 'lightning_10',
        capacity: 10,
        conference: { _id: 'conf-A' },
      },
      proposalError: null,
    })
    h.changeCapacity.mockResolvedValue({ promoted: ['s-1'] })

    await organizer().update({
      id: 'talk-1',
      data: {
        title: 'Kubernetes hands-on',
        format: 'workshop_120',
        capacity: 12,
      },
    } as never)

    expect(h.emailPromoted).toHaveBeenCalledWith('conf-A', ['s-1'])
    expect(h.updateProposal.mock.invocationCallOrder[0]).toBeLessThan(
      h.emailPromoted.mock.invocationCallOrder[0],
    )
  })
})

describe('a speaker may ask for up to 200 seats; organizers set up to 500', () => {
  const speaker = () => {
    const sp = { _id: 'sp-1', name: 'Speaker', email: 'sp@example.com' }
    const user = { email: sp.email }
    return proposalRouter.createCaller({
      session: { user, speaker: sp },
      speaker: sp,
      user,
    } as unknown as Context)
  }
  const stored = (capacity: number) => {
    h.stored = { capacity, conferenceId: 'conf-A' }
    h.getProposal.mockResolvedValue({
      proposal: {
        _id: 'talk-1',
        status: 'draft',
        format: 'workshop_120',
        capacity,
        _organizationId: 'org-A',
        // No conference: the CFP-window rule is not what is under test.
      },
      proposalError: null,
    })
  }
  const edit = (who: typeof speaker, capacity: number) =>
    who().update({
      id: 'talk-1',
      data: { title: 'Hands-on', format: 'workshop_120', capacity },
    } as never)

  it('a speaker at 200: saved', async () => {
    stored(10)
    await edit(speaker, 200)
    expect(h.changeCapacity).toHaveBeenCalled()
  })

  it('a speaker at 201: refused, nothing written', async () => {
    stored(10)
    await expect(edit(speaker, 201)).rejects.toThrow(
      'Capacity cannot exceed 200 participants. Ask the organizers for more.',
    )
    expect(h.changeCapacity).not.toHaveBeenCalled()
    expect(h.updateProposal).not.toHaveBeenCalled()
  })

  it('a speaker saving the 300 an organizer set: saved', async () => {
    stored(300)
    await edit(speaker, 300)
    expect(h.updateProposal).toHaveBeenCalledTimes(1)
  })

  it('an organizer at 300: saved', async () => {
    stored(10)
    await edit(organizer, 300)
    expect(h.changeCapacity).toHaveBeenCalledWith('talk-1', 'conf-A', 300, {
      edit: { format: 'workshop_120' },
    })
  })
})
