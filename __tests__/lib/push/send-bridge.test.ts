import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sendPushForNotifications,
  pushCategoryForNotificationType,
} from '@/lib/push/send'
import { getSpeakerPushState, prunePushSubscription } from '@/lib/push/sanity'
import { isPushConfigured, getConfiguredWebPush } from '@/lib/push/vapid'
import { getUnreadCount } from '@/lib/notification/sanity'
import type { NotificationInput } from '@/lib/notification/types'
import type { SpeakerPushState } from '@/lib/push/types'

/**
 * Tests for the notification-hub → web-push bridge (#444). The bridge replaced
 * the old bus handler: the hub is the single source of WHAT/WHEN to notify, and
 * `sendPushForNotifications` is the pure delivery channel gated by per-category
 * preferences.
 */

vi.mock('@/lib/push/sanity', () => ({
  getSpeakerPushState: vi.fn(),
  prunePushSubscription: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/push/vapid', () => ({
  isPushConfigured: vi.fn().mockReturnValue(true),
  getConfiguredWebPush: vi.fn(),
}))
vi.mock('@/lib/notification/sanity', () => ({
  getUnreadCount: vi.fn().mockResolvedValue(0),
}))

const mockGetState = vi.mocked(getSpeakerPushState)
const mockPrune = vi.mocked(prunePushSubscription)
const mockIsConfigured = vi.mocked(isPushConfigured)
const mockGetWebPush = vi.mocked(getConfiguredWebPush)
const mockGetUnreadCount = vi.mocked(getUnreadCount)

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
  mockGetUnreadCount.mockResolvedValue(0)
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
    expect(mockGetState).not.toHaveBeenCalled()
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('no-ops on an empty batch', async () => {
    await sendPushForNotifications([])
    expect(mockGetState).not.toHaveBeenCalled()
  })

  it('delivers to every subscription the recipient owns', async () => {
    mockGetState.mockResolvedValue(
      state({
        subscriptions: [
          subscription('https://push.example/a'),
          subscription('https://push.example/b'),
        ],
      }),
    )
    await sendPushForNotifications([item()])
    expect(mockGetState).toHaveBeenCalledWith('speaker-1')
    expect(sendNotification).toHaveBeenCalledTimes(2)
  })

  it('builds the payload from the hub item (title/message/link)', async () => {
    mockGetState.mockResolvedValue(state())
    await sendPushForNotifications([item()])
    const [, body] = sendNotification.mock.calls[0]
    expect(JSON.parse(body as string)).toEqual({
      title: 'Your talk was accepted',
      body: 'Decision on "My Talk".',
      url: '/cfp/proposal/p1',
    })
  })

  it('threads a stable tag into the payload so repeat pushes replace on-device (B10)', async () => {
    mockGetState.mockResolvedValue(state())
    await sendPushForNotifications([
      item({ notificationType: 'message_received', tag: 'msg:conv-1' }),
    ])
    const [, body] = sendNotification.mock.calls[0]
    expect(JSON.parse(body as string).tag).toBe('msg:conv-1')
  })

  it('omits tag entirely for items without one (one-shot types keep stacking)', async () => {
    mockGetState.mockResolvedValue(state())
    await sendPushForNotifications([item()])
    const [, body] = sendNotification.mock.calls[0]
    expect('tag' in JSON.parse(body as string)).toBe(false)
  })

  it('carries the recipient unread count as the numeric app-icon badge', async () => {
    // iOS ignores the arg-less badge form, so a closed-app push must carry the
    // count for the SW to set the numeric app-icon badge.
    mockGetState.mockResolvedValue(state())
    mockGetUnreadCount.mockResolvedValue(3)
    await sendPushForNotifications([item()])
    expect(mockGetUnreadCount).toHaveBeenCalledWith({
      speakerId: 'speaker-1',
      conferenceId: 'conf-1',
    })
    const [, body] = sendNotification.mock.calls[0]
    expect(JSON.parse(body as string).badge).toBe(3)
  })

  it('omits badge from the payload when the unread count is zero', async () => {
    mockGetState.mockResolvedValue(state())
    mockGetUnreadCount.mockResolvedValue(0)
    await sendPushForNotifications([item()])
    const [, body] = sendNotification.mock.calls[0]
    expect('badge' in JSON.parse(body as string)).toBe(false)
  })

  it('computes the unread count once for a recipient with two notifications', async () => {
    mockGetState.mockResolvedValue(state())
    mockGetUnreadCount.mockResolvedValue(2)
    await sendPushForNotifications([
      item({
        recipientId: 'speaker-1',
        notificationType: 'proposal_status_changed',
      }),
      item({ recipientId: 'speaker-1', notificationType: 'gallery_tagged' }),
    ])
    expect(mockGetUnreadCount).toHaveBeenCalledTimes(1)
  })

  it('never breaks delivery when the unread-count query fails (no badge)', async () => {
    mockGetState.mockResolvedValue(state())
    mockGetUnreadCount.mockRejectedValue(new Error('sanity down'))
    await expect(sendPushForNotifications([item()])).resolves.toBeUndefined()
    expect(sendNotification).toHaveBeenCalledTimes(1)
    const [, body] = sendNotification.mock.calls[0]
    expect('badge' in JSON.parse(body as string)).toBe(false)
  })

  it('defaults a LINKLESS notification to the /notifications page (empty body too)', async () => {
    // A notification with no deep link (system/announcement types) must push a
    // url pointing at the standalone notifications page, so a tap on a closed app
    // opens somewhere the message is readable — never the bare app root.
    mockGetState.mockResolvedValue(state())
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
    mockGetState.mockResolvedValue(
      state({ preferences: { ...ALL_ON, otherUpdates: false } }),
    )
    // proposal_submitted → otherUpdates (off) → no push.
    await sendPushForNotifications([
      item({ notificationType: 'proposal_submitted' }),
    ])
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('still delivers an enabled category when another is off', async () => {
    mockGetState.mockResolvedValue(
      state({ preferences: { ...ALL_ON, otherUpdates: false } }),
    )
    // Two items for one recipient: proposalDecisions (on) + otherUpdates (off).
    await sendPushForNotifications([
      item({ notificationType: 'proposal_status_changed' }),
      item({ notificationType: 'proposal_submitted' }),
    ])
    expect(sendNotification).toHaveBeenCalledTimes(1)
  })

  it('reads each recipient exactly once and fans out per recipient', async () => {
    mockGetState.mockResolvedValue(state())
    await sendPushForNotifications([
      item({ recipientId: 'speaker-1' }),
      item({ recipientId: 'speaker-2' }),
    ])
    expect(mockGetState).toHaveBeenCalledTimes(2)
    expect(mockGetState).toHaveBeenCalledWith('speaker-1')
    expect(mockGetState).toHaveBeenCalledWith('speaker-2')
  })

  it('does not read state twice for a recipient with two notifications', async () => {
    mockGetState.mockResolvedValue(state())
    await sendPushForNotifications([
      item({
        recipientId: 'speaker-1',
        notificationType: 'proposal_status_changed',
      }),
      item({ recipientId: 'speaker-1', notificationType: 'gallery_tagged' }),
    ])
    expect(mockGetState).toHaveBeenCalledTimes(1)
    expect(sendNotification).toHaveBeenCalledTimes(2)
  })

  it('never throws when a send rejects, and prunes a gone (410) subscription', async () => {
    mockGetState.mockResolvedValue(state())
    sendNotification.mockRejectedValueOnce({ statusCode: 410 })
    await expect(sendPushForNotifications([item()])).resolves.toBeUndefined()
    expect(mockPrune).toHaveBeenCalledWith(
      'speaker-1',
      'https://push.example/a',
    )
  })

  it('never throws when reading push state fails', async () => {
    mockGetState.mockRejectedValue(new Error('sanity down'))
    await expect(sendPushForNotifications([item()])).resolves.toBeUndefined()
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('does not send when the recipient has no subscriptions', async () => {
    mockGetState.mockResolvedValue(state({ subscriptions: [] }))
    await sendPushForNotifications([item()])
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('skips and prunes a stored endpoint that fails SSRF validation', async () => {
    // Defense in depth: an endpoint that no longer passes the public-https rule
    // (e.g. an http/loopback endpoint persisted before validation) is pruned and
    // never requested; a valid endpoint alongside it still receives the push.
    mockGetState.mockResolvedValue(
      state({
        subscriptions: [
          subscription('http://127.0.0.1/internal'),
          subscription('https://push.example/ok'),
        ],
      }),
    )
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
