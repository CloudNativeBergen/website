import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Boundary mocks --------------------------------------------------------

const commitMock = vi.fn().mockResolvedValue({})
const createMock = vi.fn()
const tx = {
  create: (...a: unknown[]) => {
    createMock(...a)
    return tx
  },
  commit: () => commitMock(),
}
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { transaction: () => tx },
  clientReadUncached: { fetch: vi.fn() },
}))

const sendPushForNotificationsMock = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/push/send', () => ({
  sendPushForNotifications: (...a: unknown[]) =>
    sendPushForNotificationsMock(...a),
}))

import { createNotifications } from './sanity'
import type { NotificationInput } from './types'

const ITEMS: NotificationInput[] = [
  {
    recipientId: 'sp-1',
    conferenceId: 'conf-1',
    notificationType: 'system',
    title: 'Test notification',
    message: 'Your push, hub, and badge are working.',
    link: '/cfp/profile#notification-settings',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createNotifications — skipPush', () => {
  it('bridges to web push by default', async () => {
    await createNotifications(ITEMS)

    expect(commitMock).toHaveBeenCalledTimes(1)
    expect(sendPushForNotificationsMock).toHaveBeenCalledTimes(1)
    expect(sendPushForNotificationsMock).toHaveBeenCalledWith(ITEMS)
  })

  it('writes the hub doc but SUPPRESSES the push bridge when skipPush is true', async () => {
    await createNotifications(ITEMS, { skipPush: true })

    // The document is still written…
    expect(createMock).toHaveBeenCalledTimes(1)
    expect(commitMock).toHaveBeenCalledTimes(1)
    // …but no second push is fired.
    expect(sendPushForNotificationsMock).not.toHaveBeenCalled()
  })
})
