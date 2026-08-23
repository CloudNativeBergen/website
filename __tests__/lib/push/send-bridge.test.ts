import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sendPushForNotifications,
  pushCategoryForNotificationType,
} from '@/lib/push/send'
import { getSpeakerPushStates, prunePushSubscription } from '@/lib/push/sanity'
import { isPushConfigured, getConfiguredWebPush } from '@/lib/push/vapid'
import { getUnreadCounts } from '@/lib/notification/sanity'
import type { NotificationInput } from '@/lib/notification/types'
import type { SpeakerPushState } from '@/lib/push/types'

/**
 * Tests for the notification-hub → web-push bridge (#444). The bridge replaced
 * the old bus handler: the hub is the single source of WHAT/WHEN to notify, and
 * `sendPushForNotifications` is the pure delivery channel gated by per-category
 * preferences.
 */

vi.mock('@/lib/push/sanity', () => ({
  getSpeakerPushStates: vi.fn(),
  prunePushSubscription: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/push/vapid', () => ({
  isPushConfigured: vi.fn().mockReturnValue(true),
  getConfiguredWebPush: vi.fn(),
}))
vi.mock('@/lib/notification/sanity', () => ({
  getUnreadCounts: vi.fn().mockResolvedValue(new Map()),
}))

const mockGetStates = vi.mocked(getSpeakerPushStates)
const mockPrune = vi.mocked(prunePushSubscription)
const mockIsConfigured = vi.mocked(isPushConfigured)
const mockGetWebPush = vi.mocked(getConfiguredWebPush)
const mockGetUnreadCounts = vi.mocked(getUnreadCounts)

/**
 * The batched push-state read, as a map keyed by speaker id. A speaker absent
 * from the map has no document (and therefore no devices) — the batched read
 * reports that as absence, not as an empty record.
 */
function setStates(states: Record<string, SpeakerPushState>) {
  mockGetStates.mockResolvedValue(new Map(Object.entries(states)))
}

/** The batched unread-count read, as a map keyed by speaker id. */
function setUnread(counts: Record<string, number>) {
  mockGetUnreadCounts.mockResolvedValue(new Map(Object.entries(counts)))
}

const sendNotification = vi.fn()

const ALL_ON = {
  proposalDecisions: true,
  talkConfirmed: true,
  coSpeakerInvites: true,
  messages: true,
  otherUpdates: true,
}

function subscription(endpoint: string) {
  return {
    endpoint,
    keys: { p256dh: 'p256dh', auth: 'auth' },
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function state(over: Partial<SpeakerPushState> = {}): SpeakerPushState {
  return {
    subscriptions: [subscription('https://push.example/a')],
    preferences: { ...ALL_ON },
    ...over,
  }
}

function item(over: Partial<NotificationInput> = {}): NotificationInput {
  return {
    recipientId: 'speaker-1',
    conferenceId: 'conf-1',
    notificationType: 'proposal_status_changed',
    title: 'Your talk was accepted',
    message: 'Decision on "My Talk".',
    link: '/cfp/proposal/p1',
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsConfigured.mockReturnValue(true)
  // Default: recipient has no unread notifications, so no badge is added to the
  // payload. Individual badge tests override this.
  setUnread({})
  setStates({ 'speaker-1': state(), 'speaker-2': state() })
  // A minimal web-push client whose sendNotification resolves with a 201.
  sendNotification.mockResolvedValue({ statusCode: 201 })
  mockGetWebPush.mockReturnValue({
    sendNotification,
  } as unknown as ReturnType<typeof getConfiguredWebPush>)
})

describe('pushCategoryForNotificationType', () => {
  it('maps proposal_status_changed → proposalDecisions', () => {
    expect(pushCategoryForNotificationType('proposal_status_changed')).toBe(
      'proposalDecisions',
    )
  })

  it('maps cospeaker_response → coSpeakerInvites', () => {
    expect(pushCategoryForNotificationType('cospeaker_response')).toBe(
      'coSpeakerInvites',
    )
  })

  it('maps message_received → messages', () => {
    expect(pushCategoryForNotificationType('message_received')).toBe('messages')
  })

  it('maps message_stale → messages (S5)', () => {
    expect(pushCategoryForNotificationType('message_stale')).toBe('messages')
  })

  it('maps conversation_assigned → messages (S4)', () => {
    expect(pushCategoryForNotificationType('conversation_assigned')).toBe(
      'messages',
    )
  })

  it.each([
    'proposal_submitted',
    'travel_support_update',
    'sponsor_activity',
    'gallery_tagged',
    'schedule_update',
    'proposal_comment',
    'system',
  ] as const)('maps %s → otherUpdates', (type) => {
    expect(pushCategoryForNotificationType(type)).toBe('otherUpdates')
  })
})

describe('sendPushForNotifications', () => {
  it('no-ops (no Sanity read, no send) when push is unconfigured', async () => {
    mockIsConfigured.mockReturnValue(false)
    await sendPushForNotifications([item()])
    expect(mockGetStates).not.toHaveBeenCalled()
    expect(mockGetUnreadCounts).not.toHaveBeenCalled()
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('no-ops on an empty batch', async () => {
    await sendPushForNotifications([])
    expect(mockGetStates).not.toHaveBeenCalled()
    expect(mockGetUnreadCounts).not.toHaveBeenCalled()
  })

  it('no-ops when every item lacks a recipient id', async () => {
    await sendPushForNotifications([item({ recipientId: '' })])
    expect(mockGetStates).not.toHaveBeenCalled()
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('delivers to every subscription the recipient owns', async () => {
    setStates({
      'speaker-1': state({
        subscriptions: [
          subscription('https://push.example/a'),
          subscription('https://push.example/b'),
        ],
      }),
    })
    await sendPushForNotifications([item()])
    expect(mockGetStates).toHaveBeenCalledWith(['speaker-1'])
    expect(sendNotification).toHaveBeenCalledTimes(2)
  })

  it('builds the payload from the hub item (title/message/link)', async () => {
    await sendPushForNotifications([item()])
    const [, body] = sendNotification.mock.calls[0]
    expect(JSON.parse(body as string)).toEqual({
      title: 'Your talk was accepted',
      body: 'Decision on "My Talk".',
      url: '/cfp/proposal/p1',
    })
  })

  it('threads a stable tag into the payload so repeat pushes replace on-device (B10)', async () => {
    await sendPushForNotifications([
      item({ notificationType: 'message_received', tag: 'msg:conv-1' }),
    ])
    const [, body] = sendNotification.mock.calls[0]
    expect(JSON.parse(body as string).tag).toBe('msg:conv-1')
  })

  it('omits tag entirely for items without one (one-shot types keep stacking)', async () => {
    await sendPushForNotifications([item()])
    const [, body] = sendNotification.mock.calls[0]
    expect('tag' in JSON.parse(body as string)).toBe(false)
  })

  it('carries the recipient unread count as the numeric app-icon badge', async () => {
    // iOS ignores the arg-less badge form, so a closed-app push must carry the
    // count for the SW to set the numeric app-icon badge.
    setUnread({ 'speaker-1': 3 })
    await sendPushForNotifications([item()])
    expect(mockGetUnreadCounts).toHaveBeenCalledWith({
      speakerIds: ['speaker-1'],
      conferenceId: 'conf-1',
    })
    const [, body] = sendNotification.mock.calls[0]
    expect(JSON.parse(body as string).badge).toBe(3)
  })

  it('omits badge from the payload when the unread count is zero', async () => {
    setUnread({ 'speaker-1': 0 })
    await sendPushForNotifications([item()])
    const [, body] = sendNotification.mock.calls[0]
    expect('badge' in JSON.parse(body as string)).toBe(false)
  })

  it('badges each recipient with THEIR OWN count, never another recipient’s', async () => {
    setUnread({ 'speaker-1': 3, 'speaker-2': 9 })
    await sendPushForNotifications([
      item({ recipientId: 'speaker-1' }),
      item({ recipientId: 'speaker-2' }),
    ])
    // Two sends, one per recipient, each carrying that recipient's own count.
    // A lookup that fell back to "the first row" would badge both with 3.
    const badges = sendNotification.mock.calls.map(
      ([, body]) => JSON.parse(body as string).badge,
    )
    expect(badges).toEqual([3, 9])
  })

  it('never breaks delivery when the unread-count query fails (no badge)', async () => {
    mockGetUnreadCounts.mockRejectedValue(new Error('sanity down'))
    await expect(sendPushForNotifications([item()])).resolves.toBeUndefined()
    expect(sendNotification).toHaveBeenCalledTimes(1)
    const [, body] = sendNotification.mock.calls[0]
    expect('badge' in JSON.parse(body as string)).toBe(false)
  })

  it('defaults a LINKLESS notification to the /notifications page (empty body too)', async () => {
    // A notification with no deep link (system/announcement types) must push a
    // url pointing at the standalone notifications page, so a tap on a closed app
    // opens somewhere the message is readable — never the bare app root.
    await sendPushForNotifications([
      item({ message: undefined, link: undefined }),
    ])
    const [, body] = sendNotification.mock.calls[0]
    expect(JSON.parse(body as string)).toEqual({
      title: 'Your talk was accepted',
      body: '',
      url: '/notifications',
    })
  })

  it('skips an item whose mapped category the recipient turned off', async () => {
    setStates({
      'speaker-1': state({ preferences: { ...ALL_ON, otherUpdates: false } }),
    })
    // proposal_submitted → otherUpdates (off) → no push.
    await sendPushForNotifications([
      item({ notificationType: 'proposal_submitted' }),
    ])
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('still delivers an enabled category when another is off', async () => {
    setStates({
      'speaker-1': state({ preferences: { ...ALL_ON, otherUpdates: false } }),
    })
    // Two items for one recipient: proposalDecisions (on) + otherUpdates (off).
    await sendPushForNotifications([
      item({ notificationType: 'proposal_status_changed' }),
      item({ notificationType: 'proposal_submitted' }),
    ])
    expect(sendNotification).toHaveBeenCalledTimes(1)
  })

  it('applies each recipient’s OWN preferences from the batched read', async () => {
    // The batched read returns one map for the whole fan-out; a lookup bug that
    // reused the first row would push to a speaker who muted the category.
    setStates({
      'speaker-1': state({ preferences: { ...ALL_ON } }),
      'speaker-2': state({ preferences: { ...ALL_ON, otherUpdates: false } }),
    })
    await sendPushForNotifications([
      item({ recipientId: 'speaker-1', notificationType: 'system' }),
      item({ recipientId: 'speaker-2', notificationType: 'system' }),
    ])
    expect(sendNotification).toHaveBeenCalledTimes(1)
  })

  it('delivers nothing to a recipient with no speaker row in the batched read', async () => {
    setStates({ 'speaker-1': state() })
    await sendPushForNotifications([item({ recipientId: 'ghost' })])
    expect(sendNotification).not.toHaveBeenCalled()
  })

  // --- BATCHING (Sanity request budget) ------------------------------------
  // These pin the READ COUNT of the fan-out. The bridge used to call
  // `getSpeakerPushState` + `getUnreadCount` once per recipient, so a
  // 200-recipient announcement cost ~400 Sanity requests. If a future edit
  // reintroduces a per-recipient read, these fail.

  it('reads push state ONCE for the whole fan-out, with every recipient id', async () => {
    setStates({
      'speaker-1': state(),
      'speaker-2': state(),
      'speaker-3': state(),
    })
    await sendPushForNotifications([
      item({ recipientId: 'speaker-1' }),
      item({ recipientId: 'speaker-2' }),
      item({ recipientId: 'speaker-3' }),
    ])
    expect(mockGetStates).toHaveBeenCalledTimes(1)
    expect(mockGetStates).toHaveBeenCalledWith([
      'speaker-1',
      'speaker-2',
      'speaker-3',
    ])
    expect(sendNotification).toHaveBeenCalledTimes(3)
  })

  it('reads unread counts ONCE for the whole fan-out, with every recipient id', async () => {
    setStates({
      'speaker-1': state(),
      'speaker-2': state(),
      'speaker-3': state(),
    })
    setUnread({ 'speaker-1': 1, 'speaker-2': 2, 'speaker-3': 3 })
    await sendPushForNotifications([
      item({ recipientId: 'speaker-1' }),
      item({ recipientId: 'speaker-2' }),
      item({ recipientId: 'speaker-3' }),
    ])
    expect(mockGetUnreadCounts).toHaveBeenCalledTimes(1)
    expect(mockGetUnreadCounts).toHaveBeenCalledWith({
      speakerIds: ['speaker-1', 'speaker-2', 'speaker-3'],
      conferenceId: 'conf-1',
    })
  })

  it('stays at 2 reads for a 40-recipient announcement (not 80)', async () => {
    const ids = Array.from({ length: 40 }, (_, i) => `speaker-${i}`)
    setStates(Object.fromEntries(ids.map((id) => [id, state()])))
    await sendPushForNotifications(ids.map((id) => item({ recipientId: id })))
    expect(mockGetStates).toHaveBeenCalledTimes(1)
    expect(mockGetUnreadCounts).toHaveBeenCalledTimes(1)
    expect(sendNotification).toHaveBeenCalledTimes(40)
  })

  it('groups the unread-count read per conference when a batch spans two', async () => {
    setStates({ 'speaker-1': state(), 'speaker-2': state() })
    await sendPushForNotifications([
      item({ recipientId: 'speaker-1', conferenceId: 'conf-1' }),
      item({ recipientId: 'speaker-2', conferenceId: 'conf-2' }),
    ])
    expect(mockGetUnreadCounts).toHaveBeenCalledTimes(2)
    expect(mockGetUnreadCounts).toHaveBeenCalledWith({
      speakerIds: ['speaker-1'],
      conferenceId: 'conf-1',
    })
    expect(mockGetUnreadCounts).toHaveBeenCalledWith({
      speakerIds: ['speaker-2'],
      conferenceId: 'conf-2',
    })
  })

  it('does not read state twice for a recipient with two notifications', async () => {
    await sendPushForNotifications([
      item({
        recipientId: 'speaker-1',
        notificationType: 'proposal_status_changed',
      }),
      item({ recipientId: 'speaker-1', notificationType: 'gallery_tagged' }),
    ])
    expect(mockGetStates).toHaveBeenCalledTimes(1)
    expect(mockGetStates).toHaveBeenCalledWith(['speaker-1'])
    expect(mockGetUnreadCounts).toHaveBeenCalledTimes(1)
    expect(sendNotification).toHaveBeenCalledTimes(2)
  })

  it('never throws when a send rejects, and prunes a gone (410) subscription', async () => {
    sendNotification.mockRejectedValueOnce({ statusCode: 410 })
    await expect(sendPushForNotifications([item()])).resolves.toBeUndefined()
    expect(mockPrune).toHaveBeenCalledWith(
      'speaker-1',
      'https://push.example/a',
    )
  })

  it('never throws when reading push state fails', async () => {
    mockGetStates.mockRejectedValue(new Error('sanity down'))
    await expect(sendPushForNotifications([item()])).resolves.toBeUndefined()
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('does not send when the recipient has no subscriptions', async () => {
    setStates({ 'speaker-1': state({ subscriptions: [] }) })
    await sendPushForNotifications([item()])
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('skips and prunes a stored endpoint that fails SSRF validation', async () => {
    // Defense in depth: an endpoint that no longer passes the public-https rule
    // (e.g. an http/loopback endpoint persisted before validation) is pruned and
    // never requested; a valid endpoint alongside it still receives the push.
    setStates({
      'speaker-1': state({
        subscriptions: [
          subscription('http://127.0.0.1/internal'),
          subscription('https://push.example/ok'),
        ],
      }),
    })
    await sendPushForNotifications([item()])
    expect(mockPrune).toHaveBeenCalledWith(
      'speaker-1',
      'http://127.0.0.1/internal',
    )
    expect(sendNotification).toHaveBeenCalledTimes(1)
    const [target] = sendNotification.mock.calls[0]
    expect((target as { endpoint: string }).endpoint).toBe(
      'https://push.example/ok',
    )
  })
})
