import { describe, it, expect, vi, beforeEach } from 'vitest'

// M3: a SPONSOR-authored last message (no author._ref) must be treated as
// "needs reply" CONSISTENTLY across the GROQ needs-reply predicate (tab + count
// + nudge, via the shared HAS_ANY_MESSAGE existence gate) and the JS per-row
// derivation (the Active-view badge). This test pins BOTH sides.

vi.mock('@/lib/sanity/helpers', () => ({
  createReference: (id: string) => ({ _type: 'reference', _ref: id }),
}))

const fetchMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { transaction: vi.fn(), create: vi.fn(), patch: vi.fn() },
  clientReadUncached: { fetch: (...a: unknown[]) => fetchMock(...a) },
}))

vi.mock('@/lib/notification/sanity', () => ({
  getOrganizerSpeakerIds: vi.fn(async () => ['org-1']),
}))

vi.mock('@/lib/teams', () => ({
  getViewerTeamKeys: vi.fn(async () => []),
}))

import {
  rawViewPredicate,
  HAS_ANY_MESSAGE,
  listConversationsForSpeaker,
} from './sanity'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('needs-reply GROQ predicate (M3)', () => {
  it('gates on message EXISTENCE (HAS_ANY_MESSAGE), not on a defined author ref', () => {
    const { predicate, needsOrganizerIds } = rawViewPredicate(
      'needs-reply',
      true,
    )
    expect(needsOrganizerIds).toBe(true)
    // The existence gate is the shared HAS_ANY_MESSAGE (also used by the nudge),
    // so a sponsor-authored last message still qualifies.
    expect(predicate).toContain(HAS_ANY_MESSAGE)
    // The OLD bug — gating existence on `defined(<last author._ref>)`, which is
    // FALSE for a sponsor message — must be gone.
    expect(predicate).not.toContain('defined(*[_type == "message"')
    // Still excludes threads whose last author IS an organizer.
    expect(predicate).toContain('in $organizerIds')
  })
})

describe('needs-reply JS row derivation (M3)', () => {
  // Route the reads listConversationsForSpeaker performs: the main conversation
  // query returns our single row; the unread + preference reads return empty.
  function routeRows(rows: unknown[]) {
    fetchMock.mockImplementation((query: string) => {
      if (query.includes('notification')) return Promise.resolve([])
      if (query.includes('conversationPreference')) return Promise.resolve([])
      return Promise.resolve(rows)
    })
  }

  const baseRow = {
    _id: 'conversation.sponsor.sfc-1',
    conversationType: 'sponsor',
    subject: 'Acme Corp',
    proposalId: null,
    proposalTitle: null,
    subjectSpeakerId: null,
    createdAt: '2026-07-01T00:00:00Z',
    lastMessageAt: '2026-07-02T00:00:00Z',
    status: 'open',
    assignedTo: null,
    archivedAt: null,
    speakerSideName: 'Acme Corp',
    speakerSideImage: null,
  }

  it('flags a SPONSOR-last-message thread (null author) as needsReply', async () => {
    routeRows([
      {
        ...baseRow,
        lastMessage: {
          authorId: null,
          authorName: null,
          authorImage: null,
          body: 'Question from the sponsor',
        },
      },
    ])

    const items = await listConversationsForSpeaker({
      speakerId: 'org-1',
      isOrganizer: true,
      conferenceId: 'conf-1',
      view: 'active',
    })
    expect(items).toHaveLength(1)
    expect(items[0].needsReply).toBe(true)
  })

  it('does NOT flag a thread whose last author is an organizer', async () => {
    routeRows([
      {
        ...baseRow,
        lastMessage: {
          authorId: 'org-1',
          authorName: 'Olga Organizer',
          authorImage: null,
          body: 'Replied',
        },
      },
    ])

    const items = await listConversationsForSpeaker({
      speakerId: 'org-1',
      isOrganizer: true,
      conferenceId: 'conf-1',
      view: 'active',
    })
    expect(items[0].needsReply).toBe(false)
  })
})
