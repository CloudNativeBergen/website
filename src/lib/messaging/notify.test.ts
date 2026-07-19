import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Boundary mocks --------------------------------------------------------

const upsertMock = vi.fn().mockResolvedValue(undefined)
const getOrganizerSpeakerIdsMock = vi
  .fn()
  .mockResolvedValue(['org-1', 'org-2', 'org-3'])
vi.mock('@/lib/notification/sanity', () => ({
  upsertMessageNotifications: (...a: unknown[]) => upsertMock(...a),
  getOrganizerSpeakerIds: () => getOrganizerSpeakerIdsMock(),
}))

// TEAMS-2 teams SOURCE: default [] ⇒ ABSENT-MEANS-TODAY (all organizers);
// per-test override narrows to a configured `cfp` team.
const getConferenceTeamsMock = vi.fn().mockResolvedValue([])
vi.mock('@/lib/teams/sanity', () => ({
  getConferenceTeams: (...a: unknown[]) => getConferenceTeamsMock(...a),
}))

vi.mock('@/lib/slack/notify', () => ({
  notifyNewSpeakerMessage: vi.fn().mockResolvedValue(undefined),
  notifySponsorMessage: vi.fn().mockResolvedValue(undefined),
}))

const emailMock = vi.fn().mockResolvedValue(undefined)
vi.mock('./email', () => ({
  sendMessageEmails: (...a: unknown[]) => emailMock(...a),
}))

// Fetch routing for the REAL ./sanity helpers (prefs) + notify's speaker rows.
const fetchMock = vi.fn((query: string) => {
  if (query.includes('conversationPreference')) return Promise.resolve([])
  if (query.includes('messagingEmailDefault')) {
    return Promise.resolve([
      { _id: 'spk-1', name: 'Speaker One', email: 'spk1@ex.test' },
      { _id: 'spk-2', name: 'Speaker Two', email: 'spk2@ex.test' },
      { _id: 'org-2', name: 'Org Two', email: 'org2@ex.test' },
    ])
  }
  return Promise.resolve(null)
})
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(a[0] as string) },
  clientWrite: {},
}))

import { notifyNewMessage } from './notify'
import type { ConversationWithContext, Message } from './types'
import type { Conference } from '@/lib/conference/types'

const conference = {
  _id: 'conf-1',
  domains: ['cnd.example'],
  contactEmail: 'hei@ex.test',
} as unknown as Conference

// A proposal thread with two speakers; the organizers group is a party.
const conversation: ConversationWithContext = {
  _id: 'conversation.1',
  conferenceId: 'conf-1',
  conversationType: 'proposal',
  proposalId: 'talk-1',
  proposalSpeakerIds: ['spk-1', 'spk-2'],
  createdById: 'spk-1',
  subject: 'A talk',
  createdAt: '2026-07-01T00:00:00Z',
  lastMessageAt: '2026-07-01T00:00:00Z',
  participants: [
    { partyType: 'speaker', speakerId: 'spk-1' },
    { partyType: 'speaker', speakerId: 'spk-2' },
    { partyType: 'group', group: 'organizers' },
  ],
}

// Authored by speaker spk-1 (a NON-organizer): the actor is excluded.
const message: Message = {
  _id: 'message.1',
  conversationId: conversation._id,
  authorId: 'spk-1',
  body: 'Hello organizers.',
  createdAt: '2026-07-01T10:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

function hubRecipients(): string[] {
  const items = upsertMock.mock.calls[0][0] as { recipientId: string }[]
  return items.map((i) => i.recipientId).sort()
}

describe('notifyNewMessage — TEAMS-2 access-vs-routing split', () => {
  it('team ABSENT: organizer group expands to ALL organizers (+ speaker recipient)', async () => {
    await notifyNewMessage({
      conversation,
      message,
      authorId: 'spk-1',
      conference,
    })
    // spk-2 (speaker party) + every organizer; actor spk-1 excluded.
    expect(hubRecipients()).toEqual(['org-1', 'org-2', 'org-3', 'spk-2'])
  })

  it('cfp team configured: organizer expansion NARROWS to team members only', async () => {
    getConferenceTeamsMock.mockResolvedValue([
      { key: 'cfp', title: 'CFP', members: ['org-2'] },
    ])
    await notifyNewMessage({
      conversation,
      message,
      authorId: 'spk-1',
      conference,
    })
    // org-1 and org-3 are organizers but NOT on the cfp team → dropped. The
    // speaker party spk-2 is unaffected by routing.
    expect(hubRecipients()).toEqual(['org-2', 'spk-2'])
  })

  it('CLASSIFICATION stays on the FULL organizer set: routed org gets no default email, speaker does', async () => {
    getConferenceTeamsMock.mockResolvedValue([
      { key: 'cfp', title: 'CFP', members: ['org-2'] },
    ])
    await notifyNewMessage({
      conversation,
      message,
      authorId: 'spk-1',
      conference,
    })
    // The individual-recipient email pass: spk-2 (classified SPEAKER via the
    // full organizer set → default ON) is emailed; org-2 (classified ORGANIZER
    // → default OFF) is not. If org-2 were mis-classified as a non-organizer it
    // would wrongly receive the speaker-default email.
    const individualCall = emailMock.mock.calls.find((c) =>
      (c[0] as { email: string }[]).some((r) => r.email === 'spk2@ex.test'),
    )
    expect(individualCall).toBeDefined()
    const emails = (individualCall![0] as { email: string }[]).map(
      (r) => r.email,
    )
    expect(emails).toContain('spk2@ex.test')
    expect(emails).not.toContain('org2@ex.test')
  })
})
