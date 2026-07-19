/**
 * @vitest-environment node
 *
 * Unit tests for the notification hub data layer (src/lib/notification/sanity.ts).
 *
 * These cover the behaviours the router test cannot (it mocks this module):
 * - the single-transaction fan-out and the never-throw contract of
 *   `createNotifications`;
 * - the SECURITY guard in `markNotificationsRead` (a client must not be able to
 *   mark another user's notifications read — only recipient-owned ids are
 *   patched);
 * - the unread-count query shape and the keyset-cursor argument passing.
 *
 * Both Sanity clients are mocked so we assert exactly what is (and is not)
 * written / queried.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/sanity/helpers', () => ({
  createReference: (id: string) => ({ _type: 'reference', _ref: id }),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    transaction: vi.fn(),
  },
  clientReadUncached: {
    fetch: vi.fn(),
  },
}))

// The push bridge is mocked so the collapse-upsert tests can assert it fires
// with the computed (count-aware) titles without touching VAPID config.
vi.mock('@/lib/push/send', () => ({
  sendPushForNotifications: vi.fn(async () => {}),
}))

import { clientWrite, clientReadUncached } from '@/lib/sanity/client'
import { sendPushForNotifications } from '@/lib/push/send'
import {
  createNotifications,
  upsertMessageNotifications,
  messageNotificationId,
  getNotificationsForSpeaker,
  getUnreadCount,
  markNotificationsRead,
  markNotificationsReadByLinks,
  markAllRead,
  deleteNotificationsOlderThan,
} from '@/lib/notification/sanity'
import type {
  MessageNotificationInput,
  NotificationInput,
} from '@/lib/notification/types'

type LooseMock = ReturnType<typeof vi.fn>
const writeMock = clientWrite as unknown as { transaction: LooseMock }
const readMock = clientReadUncached as unknown as { fetch: LooseMock }
const pushMock = sendPushForNotifications as unknown as LooseMock

/**
 * A chainable Sanity transaction mock. `create`, `createIfNotExists` and
 * `patch` return the same object; `commit` is configurable per test.
 */
function installTransaction(commit: () => Promise<unknown> = async () => ({})) {
  const tx = {
    create: vi.fn((_doc?: unknown) => tx),
    createIfNotExists: vi.fn((_doc?: unknown) => tx),
    patch: vi.fn((_id?: string, _ops?: unknown) => tx),
    delete: vi.fn((_id?: string) => tx),
    commit: vi.fn(commit),
  }
  writeMock.transaction.mockReturnValue(tx)
  return tx
}

const input = (
  overrides: Partial<NotificationInput> = {},
): NotificationInput => ({
  recipientId: 'sp-1',
  conferenceId: 'conf-1',
  notificationType: 'proposal_submitted',
  title: 'New proposal: "Test"',
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createNotifications — single-transaction fan-out', () => {
  it('writes one create per item in exactly one committed transaction', async () => {
    const tx = installTransaction()

    await createNotifications([
      input({ recipientId: 'sp-1' }),
      input({ recipientId: 'sp-2' }),
      input({ recipientId: 'sp-3' }),
    ])

    expect(writeMock.transaction).toHaveBeenCalledTimes(1)
    expect(tx.create).toHaveBeenCalledTimes(3)
    expect(tx.commit).toHaveBeenCalledTimes(1)

    const doc = tx.create.mock.calls[0][0] as Record<string, unknown>
    expect(doc._type).toBe('notification')
    expect(doc.recipient).toEqual({ _type: 'reference', _ref: 'sp-1' })
    expect(doc.conference).toEqual({ _type: 'reference', _ref: 'conf-1' })
    expect(typeof doc.createdAt).toBe('string')
  })

  it('is a no-op (no transaction) for an empty list', async () => {
    const tx = installTransaction()
    await createNotifications([])
    expect(writeMock.transaction).not.toHaveBeenCalled()
    expect(tx.commit).not.toHaveBeenCalled()
  })

  it('sets optional actor and a WEAK relatedProposal reference only when provided', async () => {
    const tx = installTransaction()

    await createNotifications([
      input({
        actorId: 'actor-1',
        relatedProposalId: 'prop-1',
        message: 'hi',
        link: '/admin/proposals/prop-1',
      }),
    ])

    const doc = tx.create.mock.calls[0][0] as Record<string, unknown>
    expect(doc.actor).toEqual({ _type: 'reference', _ref: 'actor-1' })
    expect(doc.relatedProposal).toEqual({
      _type: 'reference',
      _ref: 'prop-1',
      _weak: true,
    })
    expect(doc.message).toBe('hi')
    expect(doc.link).toBe('/admin/proposals/prop-1')
  })

  it('omits optional fields when not provided', async () => {
    const tx = installTransaction()
    await createNotifications([input()])
    const doc = tx.create.mock.calls[0][0] as Record<string, unknown>
    expect('actor' in doc).toBe(false)
    expect('relatedProposal' in doc).toBe(false)
    expect('message' in doc).toBe(false)
    expect('link' in doc).toBe(false)
  })

  it('NEVER throws when the transaction commit fails — it swallows and logs', async () => {
    installTransaction(async () => {
      throw new Error('sanity down')
    })

    await expect(createNotifications([input()])).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})

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
  actorId: 'actor-1',
  ...overrides,
})

const MSG_ID = 'notification.message.conversation.gen-1.sp-1'

describe('upsertMessageNotifications — per-conversation collapse (M5)', () => {
  it('derives the deterministic per-(conversation, recipient) id', () => {
    expect(messageNotificationId('conversation.gen-1', 'sp-1')).toBe(MSG_ID)
  })

  it('NEW: seeds count 1 via createIfNotExists and patches the same values', async () => {
    readMock.fetch.mockResolvedValue([]) // no existing docs
    const tx = installTransaction()

    await upsertMessageNotifications([msgInput()])

    // ONE batched read of the collapse state for all target ids.
    expect(readMock.fetch).toHaveBeenCalledTimes(1)
    const [query, params] = readMock.fetch.mock.calls[0]
    expect(query).toContain('_id in $ids')
    expect(query).toContain('readAt')
    expect(query).toContain('count')
    expect(params).toEqual({ ids: [MSG_ID] })

    // ONE transaction: createIfNotExists + patch on the deterministic id.
    expect(writeMock.transaction).toHaveBeenCalledTimes(1)
    expect(tx.createIfNotExists).toHaveBeenCalledTimes(1)
    const base = tx.createIfNotExists.mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(base._id).toBe(MSG_ID)
    expect(base._type).toBe('notification')
    expect(base.notificationType).toBe('message_received')
    expect(base.count).toBe(1)
    expect(base.recipient).toEqual({ _type: 'reference', _ref: 'sp-1' })
    expect(base.conference).toEqual({ _type: 'reference', _ref: 'conf-1' })

    expect(tx.patch).toHaveBeenCalledTimes(1)
    const [patchId, ops] = tx.patch.mock.calls[0] as [
      string,
      { set: Record<string, unknown>; unset: string[] },
    ]
    expect(patchId).toBe(MSG_ID)
    expect(ops.unset).toEqual(['readAt'])
    expect(ops.set.count).toBe(1)
    expect(ops.set.title).toBe('New message from Alice — A question')
    expect(ops.set.message).toBe('hey there')
    expect(ops.set.link).toBe('/cfp/messages/conversation.gen-1')
    expect(ops.set.actor).toEqual({ _type: 'reference', _ref: 'actor-1' })
    expect(typeof ops.set.createdAt).toBe('string')
    expect(tx.commit).toHaveBeenCalledTimes(1)
  })

  it('UNREAD existing: increments count and switches to the N-messages title', async () => {
    readMock.fetch.mockResolvedValue([{ _id: MSG_ID, readAt: null, count: 2 }])
    const tx = installTransaction()

    await upsertMessageNotifications([msgInput()])

    const [, ops] = tx.patch.mock.calls[0] as [
      string,
      { set: Record<string, unknown>; unset: string[] },
    ]
    expect(ops.set.count).toBe(3)
    expect(ops.set.title).toBe('3 new messages — A question')
    // Re-surfaced: readAt is unset and createdAt bumped even when incrementing.
    expect(ops.unset).toEqual(['readAt'])
    expect(typeof ops.set.createdAt).toBe('string')
  })

  it('UNREAD existing WITHOUT a count field: treats it as 1 and increments to 2', async () => {
    readMock.fetch.mockResolvedValue([{ _id: MSG_ID, readAt: null }])
    const tx = installTransaction()

    await upsertMessageNotifications([msgInput()])

    const [, ops] = tx.patch.mock.calls[0] as [
      string,
      { set: Record<string, unknown> },
    ]
    expect(ops.set.count).toBe(2)
    expect(ops.set.title).toBe('2 new messages — A question')
  })

  it('READ existing: resets to count 1, re-unreads, and bumps createdAt', async () => {
    readMock.fetch.mockResolvedValue([
      { _id: MSG_ID, readAt: '2026-07-01T00:00:00.000Z', count: 5 },
    ])
    const tx = installTransaction()

    await upsertMessageNotifications([msgInput()])

    const [, ops] = tx.patch.mock.calls[0] as [
      string,
      { set: Record<string, unknown>; unset: string[] },
    ]
    expect(ops.set.count).toBe(1)
    expect(ops.set.title).toBe('New message from Alice — A question')
    expect(ops.unset).toEqual(['readAt'])
    expect(typeof ops.set.createdAt).toBe('string')
  })

  it('BATCH: many recipients → ONE read (all ids) and ONE transaction (pair per recipient)', async () => {
    const otherId = 'notification.message.conversation.gen-1.sp-2'
    readMock.fetch.mockResolvedValue([{ _id: otherId, readAt: null, count: 4 }])
    const tx = installTransaction()

    await upsertMessageNotifications([
      msgInput({ recipientId: 'sp-1' }),
      msgInput({
        recipientId: 'sp-2',
        link: '/admin/messages/conversation.gen-1',
      }),
    ])

    expect(readMock.fetch).toHaveBeenCalledTimes(1)
    expect(readMock.fetch.mock.calls[0][1]).toEqual({
      ids: [MSG_ID, otherId],
    })
    expect(writeMock.transaction).toHaveBeenCalledTimes(1)
    expect(tx.createIfNotExists).toHaveBeenCalledTimes(2)
    expect(tx.patch).toHaveBeenCalledTimes(2)
    expect(tx.commit).toHaveBeenCalledTimes(1)

    // Per-recipient state: sp-1 is new (count 1), sp-2 accumulates (count 5).
    const bySetId = new Map(
      (tx.patch.mock.calls as [string, { set: Record<string, unknown> }][]).map(
        ([id, ops]) => [id, ops.set],
      ),
    )
    expect(bySetId.get(MSG_ID)?.count).toBe(1)
    expect(bySetId.get(otherId)?.count).toBe(5)
    expect(bySetId.get(otherId)?.title).toBe('5 new messages — A question')
  })

  it('sets a WEAK relatedProposal reference only when provided', async () => {
    readMock.fetch.mockResolvedValue([])
    const tx = installTransaction()

    await upsertMessageNotifications([
      msgInput({ relatedProposalId: 'prop-1' }),
    ])

    const [, ops] = tx.patch.mock.calls[0] as [
      string,
      { set: Record<string, unknown> },
    ]
    expect(ops.set.relatedProposal).toEqual({
      _type: 'reference',
      _ref: 'prop-1',
      _weak: true,
    })
  })

  it('bridges to web push with the computed (count-aware) title', async () => {
    readMock.fetch.mockResolvedValue([{ _id: MSG_ID, readAt: null, count: 1 }])
    installTransaction()

    await upsertMessageNotifications([msgInput()])

    expect(pushMock).toHaveBeenCalledTimes(1)
    const [pushItems] = pushMock.mock.calls[0] as [NotificationInput[]]
    expect(pushItems).toHaveLength(1)
    expect(pushItems[0].notificationType).toBe('message_received')
    expect(pushItems[0].title).toBe('2 new messages — A question')
    expect(pushItems[0].recipientId).toBe('sp-1')
  })

  it('is a no-op (no read, no transaction) for an empty list', async () => {
    const tx = installTransaction()
    await upsertMessageNotifications([])
    expect(readMock.fetch).not.toHaveBeenCalled()
    expect(writeMock.transaction).not.toHaveBeenCalled()
    expect(tx.commit).not.toHaveBeenCalled()
  })

  it('NEVER throws when the commit fails — swallows, logs, and skips push', async () => {
    readMock.fetch.mockResolvedValue([])
    installTransaction(async () => {
      throw new Error('sanity down')
    })

    await expect(
      upsertMessageNotifications([msgInput()]),
    ).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('NEVER throws when the batched read fails', async () => {
    readMock.fetch.mockRejectedValue(new Error('sanity down'))
    const tx = installTransaction()

    await expect(
      upsertMessageNotifications([msgInput()]),
    ).resolves.toBeUndefined()
    expect(tx.commit).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })

  it('NEVER throws when the push bridge rejects (already committed)', async () => {
    readMock.fetch.mockResolvedValue([])
    const tx = installTransaction()
    pushMock.mockRejectedValue(new Error('push down'))

    await expect(
      upsertMessageNotifications([msgInput()]),
    ).resolves.toBeUndefined()
    expect(tx.commit).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalled()
  })
})

describe('markNotificationsRead — recipient security guard', () => {
  it('patches ONLY recipient-owned ids (drops a foreign id) and returns the owned count', async () => {
    // The client asked to mark two ids read; the ownership fetch confirms only
    // one belongs to this speaker. The foreign id must never be patched.
    readMock.fetch.mockResolvedValue(['own-1'])
    const tx = installTransaction()

    const count = await markNotificationsRead({
      speakerId: 'sp-1',
      ids: ['own-1', 'foreign-1'],
    })

    // The ownership query is scoped by recipient._ref == $speakerId.
    const [query, params] = readMock.fetch.mock.calls[0]
    expect(query).toContain('recipient._ref == $speakerId')
    expect(query).toContain('_id in $ids')
    expect(params).toEqual({ ids: ['own-1', 'foreign-1'], speakerId: 'sp-1' })

    // Only the verified-own id is patched.
    expect(tx.patch).toHaveBeenCalledTimes(1)
    expect(tx.patch).toHaveBeenCalledWith('own-1', {
      set: { readAt: expect.any(String) },
    })
    expect(tx.commit).toHaveBeenCalledTimes(1)
    expect(count).toBe(1)
  })

  it('returns 0 and does not fetch or write for an empty id list', async () => {
    const tx = installTransaction()
    const count = await markNotificationsRead({ speakerId: 'sp-1', ids: [] })
    expect(count).toBe(0)
    expect(readMock.fetch).not.toHaveBeenCalled()
    expect(writeMock.transaction).not.toHaveBeenCalled()
    expect(tx.commit).not.toHaveBeenCalled()
  })

  it('returns 0 and writes nothing when none of the ids are owned', async () => {
    readMock.fetch.mockResolvedValue([])
    const tx = installTransaction()

    const count = await markNotificationsRead({
      speakerId: 'sp-1',
      ids: ['foreign-1', 'foreign-2'],
    })

    expect(count).toBe(0)
    expect(writeMock.transaction).not.toHaveBeenCalled()
    expect(tx.patch).not.toHaveBeenCalled()
  })
})

describe('markNotificationsReadByLinks — link-matched read (recipient guard)', () => {
  it('fetches the caller unread matching-link ids and patches ONLY those', async () => {
    // The ownership + unread + link filter IS the guard: only the caller's own
    // unread notifications whose link matches are ever returned and patched.
    readMock.fetch.mockResolvedValue(['own-1', 'own-2'])
    const tx = installTransaction()

    const count = await markNotificationsReadByLinks({
      speakerId: 'sp-1',
      links: ['/cfp/messages/c1'],
    })

    const [query, params] = readMock.fetch.mock.calls[0]
    expect(query).toContain('recipient._ref == $speakerId')
    expect(query).toContain('!defined(readAt)')
    expect(query).toContain('link in $links')
    expect(params).toEqual({ speakerId: 'sp-1', links: ['/cfp/messages/c1'] })

    expect(tx.patch).toHaveBeenCalledTimes(2)
    expect(tx.patch).toHaveBeenCalledWith('own-1', {
      set: { readAt: expect.any(String) },
    })
    expect(tx.commit).toHaveBeenCalledTimes(1)
    expect(count).toBe(2)
  })

  it('clears a COLLAPSED message notification too — matching is by link, id-agnostic (M5)', async () => {
    // A collapsed doc carries the same audience deep link as the per-message
    // docs did, so opening the thread auto-clears it through the same query.
    const collapsedId = 'notification.message.conversation.gen-1.sp-1'
    readMock.fetch.mockResolvedValue([collapsedId])
    const tx = installTransaction()

    const count = await markNotificationsReadByLinks({
      speakerId: 'sp-1',
      links: ['/cfp/messages/conversation.gen-1'],
    })

    expect(tx.patch).toHaveBeenCalledWith(collapsedId, {
      set: { readAt: expect.any(String) },
    })
    expect(count).toBe(1)
  })

  it('returns 0 and writes nothing when no unread notification matches a link', async () => {
    readMock.fetch.mockResolvedValue([])
    const tx = installTransaction()

    const count = await markNotificationsReadByLinks({
      speakerId: 'sp-1',
      links: ['/cfp/messages/none'],
    })

    expect(count).toBe(0)
    expect(writeMock.transaction).not.toHaveBeenCalled()
    expect(tx.patch).not.toHaveBeenCalled()
  })

  it('returns 0 and does not fetch for an empty link list', async () => {
    const count = await markNotificationsReadByLinks({
      speakerId: 'sp-1',
      links: [],
    })
    expect(count).toBe(0)
    expect(readMock.fetch).not.toHaveBeenCalled()
  })

  it('defensively bounds the query to at most 8 links', async () => {
    readMock.fetch.mockResolvedValue([])
    const links = Array.from({ length: 12 }, (_, i) => `/cfp/messages/c${i}`)

    await markNotificationsReadByLinks({ speakerId: 'sp-1', links })

    const [, params] = readMock.fetch.mock.calls[0]
    expect((params as { links: string[] }).links).toHaveLength(8)
  })
})

describe('markAllRead', () => {
  it('fetches bounded unread ids for the (speaker, conference) and patches each in one transaction', async () => {
    readMock.fetch.mockResolvedValue(['n-1', 'n-2'])
    const tx = installTransaction()

    const count = await markAllRead({
      speakerId: 'sp-1',
      conferenceId: 'conf-1',
    })

    const [query, params] = readMock.fetch.mock.calls[0]
    expect(query).toContain('recipient._ref == $speakerId')
    expect(query).toContain('conference._ref == $conferenceId')
    expect(query).toContain('!defined(readAt)')
    expect(query).toContain('[0...500]')
    expect(params).toEqual({ speakerId: 'sp-1', conferenceId: 'conf-1' })

    expect(tx.patch).toHaveBeenCalledTimes(2)
    expect(tx.commit).toHaveBeenCalledTimes(1)
    expect(count).toBe(2)
  })

  it('returns 0 and writes nothing when there are no unread notifications', async () => {
    readMock.fetch.mockResolvedValue([])
    const tx = installTransaction()
    const count = await markAllRead({
      speakerId: 'sp-1',
      conferenceId: 'conf-1',
    })
    expect(count).toBe(0)
    expect(writeMock.transaction).not.toHaveBeenCalled()
    expect(tx.commit).not.toHaveBeenCalled()
  })
})

describe('getUnreadCount', () => {
  it('runs a scoped count() query over undefined-readAt docs and returns the number', async () => {
    readMock.fetch.mockResolvedValue(4)

    const count = await getUnreadCount({
      speakerId: 'sp-1',
      conferenceId: 'conf-1',
    })

    const [query, params] = readMock.fetch.mock.calls[0]
    expect(query).toContain('count(')
    expect(query).toContain('recipient._ref == $speakerId')
    expect(query).toContain('conference._ref == $conferenceId')
    expect(query).toContain('!defined(readAt)')
    expect(params).toEqual({ speakerId: 'sp-1', conferenceId: 'conf-1' })
    expect(count).toBe(4)
  })

  it('coalesces a null count to 0', async () => {
    readMock.fetch.mockResolvedValue(null)
    const count = await getUnreadCount({ speakerId: 'sp-1', conferenceId: 'c' })
    expect(count).toBe(0)
  })
})

describe('getNotificationsForSpeaker — cursor pagination', () => {
  it('omits the cursor clause and passes no `before` param when none is given', async () => {
    readMock.fetch.mockResolvedValue([])

    await getNotificationsForSpeaker({
      speakerId: 'sp-1',
      conferenceId: 'conf-1',
    })

    const [query, params] = readMock.fetch.mock.calls[0]
    expect(query).toContain('order(createdAt desc)')
    expect(query).not.toContain('createdAt < $before')
    expect(params).toEqual({ speakerId: 'sp-1', conferenceId: 'conf-1' })
  })

  it('adds the `createdAt < $before` clause and threads the cursor when `before` is given', async () => {
    readMock.fetch.mockResolvedValue([])

    await getNotificationsForSpeaker({
      speakerId: 'sp-1',
      conferenceId: 'conf-1',
      before: '2026-07-01T00:00:00.000Z',
      limit: 5,
    })

    const [query, params] = readMock.fetch.mock.calls[0]
    expect(query).toContain('createdAt < $before')
    expect(query).toContain('[0...5]')
    expect(params).toEqual({
      speakerId: 'sp-1',
      conferenceId: 'conf-1',
      before: '2026-07-01T00:00:00.000Z',
    })
  })

  it('clamps an out-of-range limit into the slice bound', async () => {
    readMock.fetch.mockResolvedValue([])
    await getNotificationsForSpeaker({
      speakerId: 'sp-1',
      conferenceId: 'conf-1',
      limit: 9999,
    })
    const [query] = readMock.fetch.mock.calls[0]
    expect(query).toContain('[0...50]')
  })

  it('coalesces a null result to an empty array', async () => {
    readMock.fetch.mockResolvedValue(null)
    const result = await getNotificationsForSpeaker({
      speakerId: 'sp-1',
      conferenceId: 'conf-1',
    })
    expect(result).toEqual([])
  })
})

describe('deleteNotificationsOlderThan — batched retention cleanup', () => {
  const BATCH_SIZE = 500
  const MAX_BATCHES = 20
  const fullBatch = () => Array.from({ length: BATCH_SIZE }, (_, i) => `n-${i}`)

  it('deletes a single partial batch in ONE transaction and returns the count', async () => {
    readMock.fetch.mockResolvedValueOnce(['n-1', 'n-2', 'n-3'])
    const tx = installTransaction()

    const result = await deleteNotificationsOlderThan(90)

    // One fetch, one transaction, one delete per id, one commit.
    expect(readMock.fetch).toHaveBeenCalledTimes(1)
    expect(writeMock.transaction).toHaveBeenCalledTimes(1)
    expect(tx.delete).toHaveBeenCalledTimes(3)
    expect(tx.delete).toHaveBeenNthCalledWith(1, 'n-1')
    expect(tx.commit).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ deleted: 3 })
  })

  it('queries by a `createdAt < $cutoff` cutoff derived from `days`', async () => {
    readMock.fetch.mockResolvedValueOnce([])
    const before = Date.now() - 91 * 24 * 60 * 60 * 1000
    const after = Date.now() - 89 * 24 * 60 * 60 * 1000

    await deleteNotificationsOlderThan(90)

    const [query, params] = readMock.fetch.mock.calls[0]
    expect(query).toContain('_type == "notification"')
    expect(query).toContain('createdAt < $cutoff')
    const cutoff = Date.parse((params as { cutoff: string }).cutoff)
    // ~90 days ago, bracketed to absorb the tiny execution delay.
    expect(cutoff).toBeGreaterThanOrEqual(before)
    expect(cutoff).toBeLessThanOrEqual(after)
  })

  it('is a no-op (no transaction) when nothing is expired', async () => {
    readMock.fetch.mockResolvedValueOnce([])
    const tx = installTransaction()

    const result = await deleteNotificationsOlderThan(90)

    expect(result).toEqual({ deleted: 0 })
    expect(writeMock.transaction).not.toHaveBeenCalled()
    expect(tx.commit).not.toHaveBeenCalled()
  })

  it('coalesces a null fetch result to zero deletions', async () => {
    readMock.fetch.mockResolvedValueOnce(null)
    const result = await deleteNotificationsOlderThan(90)
    expect(result).toEqual({ deleted: 0 })
    expect(writeMock.transaction).not.toHaveBeenCalled()
  })

  it('loops across batches until a short batch drains the backlog, summing the total', async () => {
    // A full batch (keep looping) followed by a partial batch (stop).
    readMock.fetch
      .mockResolvedValueOnce(fullBatch())
      .mockResolvedValueOnce(['tail-1', 'tail-2'])
    const tx = installTransaction()

    const result = await deleteNotificationsOlderThan(90)

    // Two fetches, two transactions/commits; no extra empty fetch after the
    // short batch.
    expect(readMock.fetch).toHaveBeenCalledTimes(2)
    expect(writeMock.transaction).toHaveBeenCalledTimes(2)
    expect(tx.commit).toHaveBeenCalledTimes(2)
    expect(tx.delete).toHaveBeenCalledTimes(BATCH_SIZE + 2)
    expect(result).toEqual({ deleted: BATCH_SIZE + 2 })
  })

  it('stops at the safety cap when every batch stays full (never spins forever)', async () => {
    // Always a full batch: only the hard cap can end the loop.
    readMock.fetch.mockResolvedValue(fullBatch())
    const tx = installTransaction()

    const result = await deleteNotificationsOlderThan(90)

    expect(readMock.fetch).toHaveBeenCalledTimes(MAX_BATCHES)
    expect(tx.commit).toHaveBeenCalledTimes(MAX_BATCHES)
    expect(result).toEqual({ deleted: BATCH_SIZE * MAX_BATCHES })
  })

  it('PROPAGATES a commit failure (does NOT swallow it, unlike the fan-out paths)', async () => {
    readMock.fetch.mockResolvedValueOnce(['n-1'])
    installTransaction(async () => {
      throw new Error('sanity down')
    })

    await expect(deleteNotificationsOlderThan(90)).rejects.toThrow(
      'sanity down',
    )
  })
})
