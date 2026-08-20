/**
 * @vitest-environment node
 *
 * REGRESSION NET: the AGGREGATE unread badge counts CONVERSATIONS, not messages.
 *
 * There are two deliberately different unread tiers in this app and they are
 * easy to conflate:
 *
 *  - PER ROW (messages): `listConversationsForSpeaker` sums `coalesce(count, 1)`
 *    over the caller's unread `message_received` notifications for ONE
 *    conversation, so an inbox row's blue pill reads "7" when seven unread
 *    messages are waiting in that thread. Locked by
 *    `__tests__/lib/messaging/sanity.test.ts` ("unread counts per conversation").
 *
 *  - AGGREGATE (conversations): `getUnreadCount` is the ONLY source of a
 *    single, inbox-wide unread number. It feeds the notification bell
 *    (`NotificationBell`), the PWA app-icon badge (`AppBadgeSync`) and the
 *    numeric `badge` carried in web-push payloads (`lib/push/send.ts`). It must
 *    stay a plain document `count()`: since the M5 collapse each unread
 *    `message_received` DOCUMENT represents one conversation (its `count` field
 *    holds how many messages it stands for), so counting documents counts
 *    conversations. Summing `count` here would report messages.
 *
 * These tests fail if either tier drifts into the other.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/sanity/helpers', () => ({
  createReference: (id: string) => ({ _type: 'reference', _ref: id }),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { transaction: vi.fn() },
  clientReadUncached: { fetch: vi.fn() },
}))

vi.mock('@/lib/push/send', () => ({
  sendPushForNotifications: vi.fn(async () => {}),
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationRefForCurrentConference: vi.fn(async () => null),
}))

import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import {
  getUnreadCount,
  messageNotificationId,
  upsertMessageNotifications,
} from '@/lib/notification/sanity'
import type { MessageNotificationInput } from '@/lib/notification/types'

type LooseMock = ReturnType<typeof vi.fn>
const writeMock = clientWrite as unknown as { transaction: LooseMock }
const readMock = clientReadUncached as unknown as { fetch: LooseMock }

function installTransaction() {
  const tx = {
    create: vi.fn((_doc?: unknown) => tx),
    createIfNotExists: vi.fn((_doc?: unknown) => tx),
    patch: vi.fn((_id?: string, _ops?: unknown) => tx),
    delete: vi.fn((_id?: string) => tx),
    commit: vi.fn(async () => ({})),
  }
  writeMock.transaction.mockReturnValue(tx)
  return tx
}

const msgInput = (
  overrides: Partial<MessageNotificationInput> = {},
): MessageNotificationInput => ({
  recipientId: 'sp-1',
  conversationId: 'conversation.gen-1',
  conferenceId: 'conf-1',
  authorName: 'Alice',
  subject: 'A question',
  message: 'hey there',
  link: '/cfp/messages/conversation.gen-1',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('aggregate unread badge — counts conversations, not messages', () => {
  it('THREE messages in ONE conversation leave exactly ONE unread document (so a document count() counts conversations)', async () => {
    const id = messageNotificationId('conversation.gen-1', 'sp-1')
    const writtenIds: string[] = []
    const seededCounts: number[] = []

    // Three successive messages into the SAME thread for the SAME recipient.
    // The collapse state returned before each write is what the previous write
    // left behind: unread, with an accumulating `count`.
    const collapseStates: { _id: string; readAt: null; count: number }[][] = [
      [],
      [{ _id: id, readAt: null, count: 1 }],
      [{ _id: id, readAt: null, count: 2 }],
    ]

    for (const state of collapseStates) {
      readMock.fetch.mockResolvedValueOnce(state)
      const tx = installTransaction()

      await upsertMessageNotifications([msgInput()])

      expect(tx.createIfNotExists).toHaveBeenCalledTimes(1)
      const base = tx.createIfNotExists.mock.calls[0][0] as Record<
        string,
        unknown
      >
      writtenIds.push(base._id as string)
      const [patchedId, ops] = tx.patch.mock.calls[0] as [
        string,
        { set: Record<string, unknown> },
      ]
      expect(patchedId).toBe(base._id)
      seededCounts.push(ops.set.count as number)
    }

    // ONE distinct document across all three messages — the unread notification
    // set has cardinality 1, which is exactly the conversation count.
    expect(new Set(writtenIds).size).toBe(1)
    expect(writtenIds[0]).toBe(id)
    // ...while the MESSAGE total lives inside that single document's `count`.
    expect(seededCounts).toEqual([1, 2, 3])
  })

  it('TWO conversations for one recipient produce TWO distinct unread documents', async () => {
    readMock.fetch.mockResolvedValueOnce([])
    const tx = installTransaction()

    await upsertMessageNotifications([
      msgInput({ conversationId: 'conversation.gen-1' }),
      msgInput({ conversationId: 'conversation.gen-2' }),
    ])

    const ids = tx.createIfNotExists.mock.calls.map(
      (call) => (call[0] as Record<string, unknown>)._id,
    )
    expect(ids).toEqual([
      messageNotificationId('conversation.gen-1', 'sp-1'),
      messageNotificationId('conversation.gen-2', 'sp-1'),
    ])
    expect(new Set(ids).size).toBe(2)
  })

  it('getUnreadCount is a bare document count() — it never projects or sums the collapsed `count` field', async () => {
    readMock.fetch.mockResolvedValue(3)

    const count = await getUnreadCount({
      speakerId: 'sp-1',
      conferenceId: 'conf-1',
    })

    const [query] = readMock.fetch.mock.calls[0] as [string]
    // The WHOLE query is a single `count(*[ … ])` over documents: no trailing
    // projection to read `count` from, and nowhere to sum it. Summing messages
    // would require `{ "count": coalesce(count, 1) }` + arithmetic, or
    // `math::sum(...)`, all of which break this shape.
    expect(query.trim()).toMatch(/^count\(\*\[[^[\]]*\]\)$/)
    expect(query).toContain('notification')
    expect(query).toContain('!defined(readAt)')
    // 3 unread documents ⇒ badge 3 (three conversations), regardless of how
    // many messages those documents stand for.
    expect(count).toBe(3)
  })
})
