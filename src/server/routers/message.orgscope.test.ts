/**
 * @vitest-environment node
 *
 * B2 (#642) — ROUTER gate. An organizer-only management mutation
 * (`message.setStatus`, via `loadManageableConversation`) must be ORG-SCOPED: an
 * organizer of ANOTHER org gets NOT_FOUND (no existence oracle) for an org-A
 * thread, while a same-org organizer succeeds. The gate keys on the thread's own
 * `conferenceOrgId`, not the deprecated global `isOrganizer` flag.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

const getConversationMock = vi.fn()
const setStatusMock = vi.fn()

vi.mock('@/lib/messaging/sanity', () => ({
  listConversationsForSpeaker: vi.fn(),
  getConversationById: (...a: unknown[]) => getConversationMock(...a),
  getConversationParticipants: vi.fn(),
  listMessages: vi.fn(),
  addMessage: vi.fn(),
  ensureProposalConversation: vi.fn(),
  ensureSponsorConversation: vi.fn(),
  createGeneralConversation: vi.fn(),
  getProposalForConversation: vi.fn(),
  setConversationPreference: vi.fn(),
  setConversationStatus: (...a: unknown[]) => setStatusMock(...a),
  setConversationAssignee: vi.fn(),
  setConversationArchived: vi.fn(),
  getConversationViewCounts: vi.fn(),
  getUnreadCountsByProposalIds: vi.fn(),
  // Real access check is bypassed here — the ORG gate under test is the
  // isOrganizerForOrg(conferenceOrgId) check in loadManageableConversation.
  canAccessConversation: () => true,
}))
vi.mock('@/lib/messaging/sponsor', () => ({ getSponsorFanoutContext: vi.fn() }))
vi.mock('@/lib/notification/sanity', () => ({
  getOrganizerSpeakerIds: vi.fn(),
  createNotifications: vi.fn(),
}))
vi.mock('@/lib/messaging/notify', () => ({
  notifyNewMessage: vi.fn(),
  notifySponsorMessage: vi.fn(),
}))
vi.mock('@/lib/teams', () => ({ getViewerTeamLens: vi.fn() }))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(),
}))
vi.mock('@/server/runAfterResponse', () => ({ runAfterResponse: vi.fn() }))

import { messageRouter } from './message'

function callerFor(speaker: {
  _id: string
  isOrganizer?: boolean
  organizerOrgIds?: string[]
}) {
  const session = { speaker, user: { email: 'u@x.test' } }
  return messageRouter.createCaller({
    session,
    speaker,
    user: session.user,
  } as unknown as Context)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  getConversationMock.mockResolvedValue({
    _id: 'c1',
    conferenceId: 'conf-A',
    conferenceOrgId: 'org-A',
    conversationType: 'proposal',
    proposalSpeakerIds: [],
    createdById: 'sp-owner',
    participants: [],
  })
})

describe('message.setStatus — org-scoped organizer gate (B2)', () => {
  it('NOT_FOUND for a cross-tenant organizer (org-B) managing an org-A thread', async () => {
    const caller = callerFor({
      _id: 'org-b-admin',
      isOrganizer: true,
      organizerOrgIds: ['org-B'],
    })
    await expect(
      caller.setStatus({ conversationId: 'c1', status: 'resolved' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(setStatusMock).not.toHaveBeenCalled()
  })

  it('succeeds for a same-org organizer (org-A)', async () => {
    const caller = callerFor({
      _id: 'org-a-admin',
      isOrganizer: true,
      organizerOrgIds: ['org-A'],
    })
    const res = await caller.setStatus({
      conversationId: 'c1',
      status: 'resolved',
    })
    expect(res).toMatchObject({ conversationId: 'c1', status: 'resolved' })
    expect(setStatusMock).toHaveBeenCalledWith('c1', 'resolved')
  })
})
