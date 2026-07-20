import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

// --- Boundary mocks --------------------------------------------------------

const isPushConfiguredMock = vi.fn(() => true)
vi.mock('@/lib/push/vapid', () => ({
  isPushConfigured: () => isPushConfiguredMock(),
  getVapidPublicKey: () => 'vapid-public-key',
}))

const getSpeakerPushStateMock = vi.fn()
const prunePushSubscriptionMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/push/sanity', () => ({
  getSpeakerPushState: (...a: unknown[]) => getSpeakerPushStateMock(...a),
  prunePushSubscription: (...a: unknown[]) => prunePushSubscriptionMock(...a),
  addPushSubscription: vi.fn(),
  removePushSubscription: vi.fn(),
  getPushPreferences: vi.fn(),
  setPushPreferences: vi.fn(),
}))

const sendPushMock = vi.fn()
const sendPushForNotificationsMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/push/send', () => ({
  sendPush: (...a: unknown[]) => sendPushMock(...a),
  sendPushForNotifications: (...a: unknown[]) =>
    sendPushForNotificationsMock(...a),
}))

vi.mock('@/lib/push/validate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/push/validate')>()),
  isValidPushEndpoint: () => true,
}))

const createNotificationsMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/notification/sanity', () => ({
  createNotifications: (...a: unknown[]) => createNotificationsMock(...a),
}))

// resolveConferenceId (in @/server/trpc) reads the current domain's conference.
const getConferenceForCurrentDomainMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: () => getConferenceForCurrentDomainMock(),
}))

import { pushRouter } from './push'

// Distinct speaker per test so the module-level `sendTest` cooldown never
// collides across cases.
function callerFor(speakerId: string) {
  const speaker = { _id: speakerId, name: 'Test Speaker', isOrganizer: false }
  const ctx = {
    session: { speaker, user: { name: 'Test Speaker' } },
    speaker,
  } as unknown as Context
  return pushRouter.createCaller(ctx)
}

beforeEach(() => {
  vi.clearAllMocks()
  isPushConfiguredMock.mockReturnValue(true)
  sendPushMock.mockResolvedValue({ ok: true })
  getConferenceForCurrentDomainMock.mockResolvedValue({
    conference: { _id: 'conf-1' },
  })
  getSpeakerPushStateMock.mockResolvedValue({
    subscriptions: [
      {
        endpoint: 'https://push.example/ep-1',
        keys: { p256dh: 'p', auth: 'a' },
      },
    ],
    preferences: {},
  })
})

describe('push.sendTest — hub mirror', () => {
  it('writes exactly ONE self `system` hub notification with the settings deep link', async () => {
    const caller = callerFor('sp-hub-1')
    const result = await caller.sendTest()

    // Existing send contract is intact.
    expect(result).toMatchObject({
      sent: 1,
      gone: 0,
      total: 1,
      configured: true,
    })

    // Exactly one hub write, to the caller, as a `system` notification.
    expect(createNotificationsMock).toHaveBeenCalledTimes(1)
    const [items, options] = createNotificationsMock.mock.calls[0]
    expect(items).toEqual([
      {
        recipientId: 'sp-hub-1',
        conferenceId: 'conf-1',
        notificationType: 'system',
        title: 'Test notification',
        message: 'Your push, hub, and badge are working.',
        link: '/cfp/profile#notification-settings',
      },
    ])
    // NO actor (self/system) and NO relatedProposal.
    expect(items[0].actorId).toBeUndefined()

    // CRITICAL: the hub write must NOT bridge a SECOND push.
    expect(options).toEqual({ skipPush: true })
    expect(sendPushForNotificationsMock).not.toHaveBeenCalled()
  })

  it('aligns the direct test push url with the hub item deep link', async () => {
    const caller = callerFor('sp-hub-2')
    await caller.sendTest()

    expect(sendPushMock).toHaveBeenCalledTimes(1)
    const [, payload] = sendPushMock.mock.calls[0]
    expect(payload).toMatchObject({
      title: 'Test notification',
      url: '/cfp/profile#notification-settings',
      tag: 'test-notification',
    })
  })

  it('NEVER-FAIL: a hub-write failure (conference resolve throws) does not fail the send', async () => {
    getConferenceForCurrentDomainMock.mockResolvedValueOnce({
      conference: null,
      error: new Error('no domain'),
    })
    const caller = callerFor('sp-hub-3')

    const result = await caller.sendTest()

    // The send still succeeded — the button reads this result.
    expect(result).toMatchObject({ sent: 1, total: 1, configured: true })
    // The hub write was never attempted (conference could not resolve).
    expect(createNotificationsMock).not.toHaveBeenCalled()
    // And still no second push.
    expect(sendPushForNotificationsMock).not.toHaveBeenCalled()
  })

  it('does not write a hub notification when push is unconfigured', async () => {
    isPushConfiguredMock.mockReturnValue(false)
    const caller = callerFor('sp-hub-4')

    const result = await caller.sendTest()

    expect(result).toEqual({ sent: 0, gone: 0, total: 0, configured: false })
    expect(createNotificationsMock).not.toHaveBeenCalled()
  })

  it('does not write a hub notification when the caller has no subscriptions', async () => {
    getSpeakerPushStateMock.mockResolvedValueOnce({
      subscriptions: [],
      preferences: {},
    })
    const caller = callerFor('sp-hub-5')

    const result = await caller.sendTest()

    expect(result).toEqual({ sent: 0, gone: 0, total: 0, configured: true })
    expect(createNotificationsMock).not.toHaveBeenCalled()
  })
})
