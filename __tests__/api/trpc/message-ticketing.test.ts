/**
 * @vitest-environment node
 *
 * Router-level tests for the ticketing procedures on `message.*`:
 * - `listConversations` rejects the organizer-only views for a non-organizer and
 *   passes `view` through for both audiences;
 * - `setStatus` / `setAssignee` / `setArchived` are organizer-only (NOT_FOUND
 *   for a non-organizer, per A3) and authz-checked;
 * - `setAssignee` validates the assignee is an organizer (null unassigns);
 * - `setPreference` forwards the per-user `archived` flag.
 *
 * The data layer is mocked (IO functions only); the pure authz helper runs for
 * real so the denial paths exercise the true rule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createAuthenticatedCaller,
  createAdminCaller,
  speakers,
} from '../../helpers/trpc'
import type { ConversationWithContext } from '@/lib/messaging/types'

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(async () => ({
    conference: { _id: 'conf-1', domains: ['cndn.no'] },
    domain: 'cndn.no',
    error: null,
  })),
}))

vi.mock('@/lib/messaging/notify', () => ({
  notifyNewMessage: vi.fn(async () => {}),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn(async () => null) },
}))

vi.mock('@/lib/notification/sanity', () => ({
  getOrganizerSpeakerIds: vi.fn(async () => [] as string[]),
}))

vi.mock('@/lib/messaging/sanity', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/messaging/sanity')>()
  return {
    ...actual, // keep the real canAccessConversation
    getConversationById: vi.fn(),
    getConversationParticipants: vi.fn(async () => []),
    getConversationPreference: vi.fn(async () => ({
      muted: false,
      emailOverride: 'default',
    })),
    listConversationsForSpeaker: vi.fn(async () => []),
    setConversationPreference: vi.fn(async () => ({
      muted: false,
      emailOverride: 'default',
    })),
    setConversationStatus: vi.fn(async () => {}),
    setConversationAssignee: vi.fn(async () => {}),
    setConversationArchived: vi.fn(async () => {}),
  }
})

import {
  getConversationById,
  listConversationsForSpeaker,
  setConversationStatus,
  setConversationAssignee,
  setConversationArchived,
  setConversationPreference,
} from '@/lib/messaging/sanity'
import { getOrganizerSpeakerIds } from '@/lib/notification/sanity'

type LooseMock = ReturnType<typeof vi.fn>
const getById = getConversationById as unknown as LooseMock
const listConvs = listConversationsForSpeaker as unknown as LooseMock
const setStatus = setConversationStatus as unknown as LooseMock
const setAssignee = setConversationAssignee as unknown as LooseMock
const setArchived = setConversationArchived as unknown as LooseMock
const setPref = setConversationPreference as unknown as LooseMock
const orgIds = getOrganizerSpeakerIds as unknown as LooseMock

const speaker1 = speakers[0]._id // not an organizer
const organizerId = speakers.find((s) => s.isOrganizer)!._id

const proposalConv: ConversationWithContext = {
  _id: 'conversation.proposal.prop-1',
  conferenceId: 'conf-1',
  conversationType: 'proposal',
  proposalId: 'prop-1',
  proposalTitle: 'T',
  proposalSpeakerIds: [speaker1],
  createdById: speaker1,
  subject: 'T',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastMessageAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listConversations — view restriction', () => {
  it('rejects an organizer-only view for a non-organizer (BAD_REQUEST)', async () => {
    const caller = createAuthenticatedCaller(speaker1)
    for (const view of ['needs-reply', 'mine', 'resolved'] as const) {
      await expect(caller.message.listConversations({ view })).rejects.toThrow(
        /BAD_REQUEST|not available/,
      )
    }
    expect(listConvs).not.toHaveBeenCalled()
  })

  it('allows the speaker-appropriate views for a non-organizer', async () => {
    const caller = createAuthenticatedCaller(speaker1)
    await caller.message.listConversations({ view: 'archived' })
    expect(listConvs).toHaveBeenCalledWith(
      expect.objectContaining({ isOrganizer: false, view: 'archived' }),
    )
  })

  it('passes an organizer-only view through for an organizer', async () => {
    const caller = createAdminCaller()
    await caller.message.listConversations({ view: 'needs-reply' })
    expect(listConvs).toHaveBeenCalledWith(
      expect.objectContaining({ isOrganizer: true, view: 'needs-reply' }),
    )
  })
})

describe('setStatus — organizer only', () => {
  it('lets an organizer resolve a thread', async () => {
    getById.mockResolvedValue(proposalConv)
    const caller = createAdminCaller()
    const result = await caller.message.setStatus({
      conversationId: proposalConv._id,
      status: 'resolved',
    })
    expect(setStatus).toHaveBeenCalledWith(proposalConv._id, 'resolved')
    expect(result).toEqual({
      conversationId: proposalConv._id,
      status: 'resolved',
    })
  })

  it('denies a non-organizer participant with NOT_FOUND (no capability oracle)', async () => {
    getById.mockResolvedValue(proposalConv) // speaker1 IS a participant
    const caller = createAuthenticatedCaller(speaker1)
    await expect(
      caller.message.setStatus({
        conversationId: proposalConv._id,
        status: 'resolved',
      }),
    ).rejects.toThrow(/NOT_FOUND|not found/)
    expect(setStatus).not.toHaveBeenCalled()
  })

  it('returns NOT_FOUND for an absent conversation', async () => {
    getById.mockResolvedValue(null)
    const caller = createAdminCaller()
    await expect(
      caller.message.setStatus({ conversationId: 'nope', status: 'open' }),
    ).rejects.toThrow(/NOT_FOUND|not found/)
  })
})

describe('setAssignee — organizer validation', () => {
  it('assigns when the target is an organizer', async () => {
    getById.mockResolvedValue(proposalConv)
    orgIds.mockResolvedValue([organizerId, 'org-2'])
    const caller = createAdminCaller()
    await caller.message.setAssignee({
      conversationId: proposalConv._id,
      assigneeId: 'org-2',
    })
    expect(setAssignee).toHaveBeenCalledWith(proposalConv._id, 'org-2')
  })

  it('rejects a non-organizer assignee with BAD_REQUEST', async () => {
    getById.mockResolvedValue(proposalConv)
    orgIds.mockResolvedValue([organizerId])
    const caller = createAdminCaller()
    await expect(
      caller.message.setAssignee({
        conversationId: proposalConv._id,
        assigneeId: speaker1, // not an organizer
      }),
    ).rejects.toThrow(/BAD_REQUEST|organizer/)
    expect(setAssignee).not.toHaveBeenCalled()
  })

  it('allows unassigning (null) without an organizer check', async () => {
    getById.mockResolvedValue(proposalConv)
    const caller = createAdminCaller()
    await caller.message.setAssignee({
      conversationId: proposalConv._id,
      assigneeId: null,
    })
    expect(orgIds).not.toHaveBeenCalled()
    expect(setAssignee).toHaveBeenCalledWith(proposalConv._id, null)
  })
})

describe('setArchived — organizer only (global archive)', () => {
  it('lets an organizer archive globally', async () => {
    getById.mockResolvedValue(proposalConv)
    const caller = createAdminCaller()
    await caller.message.setArchived({
      conversationId: proposalConv._id,
      archived: true,
    })
    expect(setArchived).toHaveBeenCalledWith(proposalConv._id, true)
  })

  it('denies a non-organizer with NOT_FOUND', async () => {
    getById.mockResolvedValue(proposalConv)
    const caller = createAuthenticatedCaller(speaker1)
    await expect(
      caller.message.setArchived({
        conversationId: proposalConv._id,
        archived: true,
      }),
    ).rejects.toThrow(/NOT_FOUND|not found/)
    expect(setArchived).not.toHaveBeenCalled()
  })
})

describe('setPreference — per-user archive passthrough', () => {
  it('forwards the archived flag for a participant (speaker)', async () => {
    getById.mockResolvedValue(proposalConv) // speaker1 is a participant
    const caller = createAuthenticatedCaller(speaker1)
    await caller.message.setPreference({
      conversationId: proposalConv._id,
      archived: true,
    })
    expect(setPref).toHaveBeenCalledWith(
      expect.objectContaining({ speakerId: speaker1, archived: true }),
    )
  })
})
