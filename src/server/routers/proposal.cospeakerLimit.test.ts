/**
 * @vitest-environment node
 *
 * THE PER-FORMAT CO-SPEAKER LIMIT IS A CFP-SUBMISSION RULE, NOT A DATA INVARIANT (#1023).
 *
 * Two callers write the same `speakers[]`:
 *
 *  - `proposal.invitation.send` — a speaker invites a co-speaker through the
 *    CFP. This is the submission path and it KEEPS enforcing the limit.
 *  - `proposal.admin.update` — an organizer picks the speaker list directly.
 *    Organizers may deliberately exceed the format's limit (a format switch to
 *    a smaller format is exactly that case), so this path is permissive.
 *
 * These tests pin both halves so neither drifts into the other.
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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'
import { proposalRouter } from './proposal'
import { Format, Status } from '@/lib/proposal/types'
import { getCoSpeakerLimit } from '@/lib/cospeaker/constants'

const ORG_A = 'org-A'

function caller(speaker: Record<string, unknown>) {
  const user = { email: (speaker.email as string) ?? 'a@example.com' }
  return proposalRouter.createCaller({
    session: { user, speaker },
    speaker,
    user,
  } as unknown as Context)
}

const organizer = () =>
  caller({
    _id: 'sp-admin',
    name: 'Admin',
    email: 'admin@example.com',
    isOrganizer: true,
    organizerOrgIds: [ORG_A],
  })

const cfpSpeaker = () =>
  caller({
    _id: 'sp-owner',
    name: 'Owner',
    email: 'owner@example.com',
    isOrganizer: false,
    organizerOrgIds: [],
  })

beforeEach(() => {
  vi.clearAllMocks()
  h.getConference.mockResolvedValue({
    conference: { _id: 'conf-A', organization: { _ref: ORG_A } },
    error: null,
  })
  h.updateProposal.mockResolvedValue({ proposal: { _id: 'talk-1' }, err: null })
  h.currentSpeakerRefs = []
})

describe('organizer speaker selection ignores the format limit (#1023)', () => {
  it('saves a lightning talk with three speakers — twice over its limit', async () => {
    // lightning_10 allows 0 co-speakers: 1 speaker total at submission.
    expect(getCoSpeakerLimit(Format.lightning_10)).toBe(0)

    await organizer().admin.update({
      id: 'talk-1',
      data: {
        format: Format.lightning_10,
        speakers: ['sp-1', 'sp-2', 'sp-3'],
      },
    })

    const [, patch] = h.updateProposal.mock.calls[0]
    expect(patch.speakers).toHaveLength(3)
  })

  it('THE FORMAT SWITCH: keeps a 3-speaker list when the format drops to presentation_20', async () => {
    // The list was legal for presentation_40 (2 co-speakers). Switching to
    // presentation_20 (1 co-speaker) makes it over-limit; the organizer's save
    // must still go through and must not trim anyone.
    h.currentSpeakerRefs = ['sp-1', 'sp-2', 'sp-3']

    await organizer().admin.update({
      id: 'talk-1',
      data: {
        format: Format.presentation_20,
        speakers: ['sp-1', 'sp-2', 'sp-3'],
      },
    })

    const [, patch] = h.updateProposal.mock.calls[0]
    expect(patch.format).toBe(Format.presentation_20)
    expect(patch.speakers.map((r: { _ref: string }) => r._ref)).toEqual([
      'sp-1',
      'sp-2',
      'sp-3',
    ])
  })
})

describe('the CFP invitation path still enforces the format limit (#1023)', () => {
  const proposalAt = (format: Format, speakerIds: string[]) => ({
    _id: 'talk-1',
    status: Status.submitted,
    format,
    conference: { _id: 'conf-A' },
    speakers: speakerIds.map((id) => ({ _id: id, email: `${id}@example.com` })),
    coSpeakerInvitations: [],
  })

  it('refuses a co-speaker invitation on a lightning talk', async () => {
    h.getProposal.mockResolvedValue({
      proposal: proposalAt(Format.lightning_10, ['sp-owner']),
      proposalError: null,
    })

    await expect(
      cfpSpeaker().invitation.send({
        proposalId: 'talk-1',
        invitedEmail: 'guest@example.com',
        invitedName: 'Guest',
      }),
    ).rejects.toThrow(/does not allow co-speakers/)
    expect(h.createInvitation).not.toHaveBeenCalled()
  })

  it('refuses an invitation once the format limit is already reached', async () => {
    // presentation_20: 1 co-speaker, already present.
    h.getProposal.mockResolvedValue({
      proposal: proposalAt(Format.presentation_20, ['sp-owner', 'sp-2']),
      proposalError: null,
    })

    await expect(
      cfpSpeaker().invitation.send({
        proposalId: 'talk-1',
        invitedEmail: 'guest@example.com',
        invitedName: 'Guest',
      }),
    ).rejects.toThrow(/at most 1 co-speaker/)
    expect(h.createInvitation).not.toHaveBeenCalled()
  })

  it('refuses an invitation on an over-limit proposal an organizer built', async () => {
    // The organizer override above does NOT reopen the invitation path.
    h.getProposal.mockResolvedValue({
      proposal: proposalAt(Format.presentation_20, [
        'sp-owner',
        'sp-2',
        'sp-3',
      ]),
      proposalError: null,
    })

    await expect(
      cfpSpeaker().invitation.send({
        proposalId: 'talk-1',
        invitedEmail: 'guest@example.com',
        invitedName: 'Guest',
      }),
    ).rejects.toThrow(/at most 1 co-speaker/)
    expect(h.createInvitation).not.toHaveBeenCalled()
  })
})
