import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- Sanity client mock (transaction boundary) -----------------------------

const fetchMock = vi.fn()
const commitMock = vi.fn().mockResolvedValue({ transactionId: 'tx-1' })

// Ordered record of every committed delete batch, so tests can assert the
// deletion ORDER across transactions (messages → preferences → conversations →
// notifications) as well as chunk sizes.
const committedBatches: string[][] = []
let currentBatch: string[] = []

const transactionApi = {
  delete: (id: string) => {
    currentBatch.push(id)
    return transactionApi
  },
  commit: () => {
    committedBatches.push([...currentBatch])
    currentBatch = []
    return commitMock()
  },
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: (...args: unknown[]) => fetchMock(...args) },
  clientWrite: {
    transaction: () => transactionApi,
  },
}))

import {
  deleteExpiredMessagingData,
  messagingRetentionCutoff,
  RETENTION_MONTHS,
} from './retention'

// --- Fetch routing ---------------------------------------------------------

interface ConversationDoc {
  _id: string
  conversationType: 'proposal' | 'general'
  proposalId?: string | null
}

interface ConferenceThreads {
  conversations: ConversationDoc[]
  messageIds: string[]
  preferenceIds: string[]
  notificationIds: string[]
}

interface Routes {
  conferences: { _id: string; title: string | null }[]
  // Keyed by conference _id.
  threads: Record<string, ConferenceThreads>
}

function routeFetch(routes: Routes) {
  return (query: string, params: Record<string, unknown> = {}) => {
    if (query.includes('_type == "conference"')) {
      return Promise.resolve(routes.conferences)
    }
    if (query.includes('_type == "conversation"')) {
      const conferenceId = params.conferenceId as string
      return Promise.resolve(routes.threads[conferenceId]?.conversations ?? [])
    }
    if (query.includes('_type == "message"')) {
      // Resolve by the conversation ids passed in.
      const ids = params.conversationIds as string[]
      const owner = Object.values(routes.threads).find((t) =>
        t.conversations.some((c) => ids.includes(c._id)),
      )
      return Promise.resolve(owner?.messageIds ?? [])
    }
    if (query.includes('_type == "conversationPreference"')) {
      const ids = params.conversationIds as string[]
      const owner = Object.values(routes.threads).find((t) =>
        t.conversations.some((c) => ids.includes(c._id)),
      )
      return Promise.resolve(owner?.preferenceIds ?? [])
    }
    if (query.includes('_type == "notification"')) {
      const links = params.links as string[]
      const owner = Object.values(routes.threads).find((t) =>
        t.conversations.some(
          (c) =>
            links.includes(`/admin/proposals/${c.proposalId}#messages`) ||
            links.includes(`/admin/messages/${c._id}`),
        ),
      )
      return Promise.resolve(owner?.notificationIds ?? [])
    }
    return Promise.resolve([])
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  commitMock.mockClear()
  committedBatches.length = 0
  currentBatch = []
})

afterEach(() => {
  vi.useRealTimers()
})

// --- Cutoff query shape ----------------------------------------------------

describe('messagingRetentionCutoff', () => {
  it('is exactly RETENTION_MONTHS (24) months before now, in UTC YYYY-MM-DD', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-19T12:00:00.000Z'))
    expect(RETENTION_MONTHS).toBe(24)
    expect(messagingRetentionCutoff()).toBe('2024-07-19')
  })

  it('selects a 25-months-ago conference and excludes a 23-months-ago one', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-19T12:00:00.000Z'))
    const cutoff = messagingRetentionCutoff() // 2024-07-19

    // endDate < cutoff is the eligibility predicate the GROQ query applies.
    const twentyFiveMonthsAgo = '2024-06-19' // ended > 24 months ago → eligible
    const twentyThreeMonthsAgo = '2024-08-19' // ended < 24 months ago → kept

    expect(twentyFiveMonthsAgo < cutoff).toBe(true)
    expect(twentyThreeMonthsAgo < cutoff).toBe(false)
  })
})

// --- deleteExpiredMessagingData --------------------------------------------

describe('deleteExpiredMessagingData', () => {
  it('is a no-op with zeroed summary when no conference is expired', async () => {
    fetchMock.mockImplementation(routeFetch({ conferences: [], threads: {} }))

    const summary = await deleteExpiredMessagingData()

    expect(summary).toEqual({
      conferences: 0,
      messages: 0,
      conversations: 0,
      preferences: 0,
      notifications: 0,
    })
    expect(commitMock).not.toHaveBeenCalled()
    expect(committedBatches).toEqual([])
  })

  it('deletes in order messages → preferences → conversations → notifications', async () => {
    fetchMock.mockImplementation(
      routeFetch({
        conferences: [{ _id: 'conf-1', title: 'JavaZone 2024' }],
        threads: {
          'conf-1': {
            conversations: [
              {
                _id: 'conversation.proposal.p1',
                conversationType: 'proposal',
                proposalId: 'p1',
              },
              {
                _id: 'conversation.g1',
                conversationType: 'general',
                proposalId: null,
              },
            ],
            messageIds: ['message.m1', 'message.m2'],
            preferenceIds: ['convpref.conversation.g1.s1'],
            notificationIds: ['notification.message.conversation.g1.s1'],
          },
        },
      }),
    )

    const summary = await deleteExpiredMessagingData()

    expect(summary).toEqual({
      conferences: 1,
      messages: 2,
      conversations: 2,
      preferences: 1,
      notifications: 1,
    })

    // Four distinct commits, in the required order.
    expect(committedBatches).toEqual([
      ['message.m1', 'message.m2'],
      ['convpref.conversation.g1.s1'],
      ['conversation.proposal.p1', 'conversation.g1'],
      ['notification.message.conversation.g1.s1'],
    ])
  })

  it('chunks each doc type at 100 ids per transaction', async () => {
    const messageIds = Array.from({ length: 250 }, (_, i) => `message.m${i}`)
    fetchMock.mockImplementation(
      routeFetch({
        conferences: [{ _id: 'conf-1', title: null }],
        threads: {
          'conf-1': {
            conversations: [
              {
                _id: 'conversation.g1',
                conversationType: 'general',
                proposalId: null,
              },
            ],
            messageIds,
            preferenceIds: [],
            notificationIds: [],
          },
        },
      }),
    )

    const summary = await deleteExpiredMessagingData()

    expect(summary.messages).toBe(250)
    // Only messages + the one conversation produce commits (prefs/notifs empty).
    const messageBatches = committedBatches.filter((b) =>
      b[0]?.startsWith('message.'),
    )
    expect(messageBatches.map((b) => b.length)).toEqual([100, 100, 50])
  })

  it('isolates a per-conference failure and still processes the others', async () => {
    fetchMock.mockImplementation((query: string, params = {}) => {
      // Fail the message read for conf-bad only; every other read routes normally.
      if (
        query.includes('_type == "message"') &&
        (params as { conversationIds: string[] }).conversationIds.includes(
          'conversation.bad',
        )
      ) {
        return Promise.reject(new Error('boom'))
      }
      return routeFetch({
        conferences: [
          { _id: 'conf-bad', title: 'Broken' },
          { _id: 'conf-ok', title: 'Fine' },
        ],
        threads: {
          'conf-bad': {
            conversations: [
              {
                _id: 'conversation.bad',
                conversationType: 'general',
                proposalId: null,
              },
            ],
            messageIds: ['message.bad'],
            preferenceIds: [],
            notificationIds: [],
          },
          'conf-ok': {
            conversations: [
              {
                _id: 'conversation.ok',
                conversationType: 'general',
                proposalId: null,
              },
            ],
            messageIds: ['message.ok'],
            preferenceIds: [],
            notificationIds: [],
          },
        },
      })(query, params)
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const summary = await deleteExpiredMessagingData()
    errorSpy.mockRestore()

    // conf-bad contributes nothing; conf-ok is fully processed.
    expect(summary.conferences).toBe(1)
    expect(summary.messages).toBe(1)
    expect(committedBatches).toEqual([['message.ok'], ['conversation.ok']])
  })
})
