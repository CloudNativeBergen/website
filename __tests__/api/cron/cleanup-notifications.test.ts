/**
 * @vitest-environment node
 */
import { NextRequest } from 'next/server'

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockDeleteOlderThan = vi.fn<(...args: any[]) => any>()
const mockDeleteMessaging = vi.fn<(...args: any[]) => any>()
const mockNudgeStale = vi.fn<(...args: any[]) => any>()

vi.mock('@/lib/notification/sanity', () => ({
  deleteNotificationsOlderThan: (...args: unknown[]) =>
    mockDeleteOlderThan(...args),
}))

vi.mock('@/lib/messaging/retention', () => ({
  deleteExpiredMessagingData: (...args: unknown[]) =>
    mockDeleteMessaging(...args),
}))

vi.mock('@/lib/messaging/nudge', () => ({
  nudgeStaleConversations: (...args: unknown[]) => mockNudgeStale(...args),
}))

vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
}))

describe('api/cron/cleanup-notifications', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterAll(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-cron-secret'
    mockDeleteOlderThan.mockResolvedValue({ deleted: 0 })
    mockDeleteMessaging.mockResolvedValue({
      conferences: 0,
      messages: 0,
      conversations: 0,
      preferences: 0,
      notifications: 0,
    })
    mockNudgeStale.mockResolvedValue({
      scanned: 0,
      nudged: 0,
      notifications: 0,
      failed: 0,
    })
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  function cronRequest(authHeader?: string): NextRequest {
    return new NextRequest(
      'http://localhost:3000/api/cron/cleanup-notifications',
      {
        headers: authHeader ? { authorization: authHeader } : {},
      },
    )
  }

  describe('Authentication', () => {
    it('returns 401 without authorization header', async () => {
      const { GET } = await import('@/app/api/cron/cleanup-notifications/route')
      const response = await GET(cronRequest())
      expect(response.status).toBe(401)
      expect(mockDeleteOlderThan).not.toHaveBeenCalled()
    })

    it('returns 401 with wrong token', async () => {
      const { GET } = await import('@/app/api/cron/cleanup-notifications/route')
      const response = await GET(cronRequest('Bearer wrong-secret'))
      expect(response.status).toBe(401)
      expect(mockDeleteOlderThan).not.toHaveBeenCalled()
    })

    it('returns 500 when CRON_SECRET is not set', async () => {
      delete process.env.CRON_SECRET
      const { GET } = await import('@/app/api/cron/cleanup-notifications/route')
      const response = await GET(cronRequest('Bearer test-cron-secret'))
      expect(response.status).toBe(500)
      expect(mockDeleteOlderThan).not.toHaveBeenCalled()
    })
  })

  describe('Cleanup', () => {
    it('deletes notifications older than 90 days and returns the count', async () => {
      mockDeleteOlderThan.mockResolvedValueOnce({ deleted: 7 })
      const { GET } = await import('@/app/api/cron/cleanup-notifications/route')

      const response = await GET(cronRequest('Bearer test-cron-secret'))
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.deleted).toBe(7)
      expect(mockDeleteOlderThan).toHaveBeenCalledWith(90)
    })

    it('runs the stale-thread nudge AFTER retention and returns its summary', async () => {
      mockNudgeStale.mockResolvedValueOnce({
        scanned: 5,
        nudged: 3,
        notifications: 4,
        failed: 1,
      })
      const { GET } = await import('@/app/api/cron/cleanup-notifications/route')

      const response = await GET(cronRequest('Bearer test-cron-secret'))
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.staleNudge).toEqual({
        scanned: 5,
        nudged: 3,
        notifications: 4,
        failed: 1,
      })
      // Ordered: notification cleanup → messaging retention → stale nudge.
      const nudgeOrder = mockNudgeStale.mock.invocationCallOrder[0]
      expect(nudgeOrder).toBeGreaterThan(
        mockDeleteMessaging.mock.invocationCallOrder[0],
      )
      expect(mockDeleteMessaging.mock.invocationCallOrder[0]).toBeGreaterThan(
        mockDeleteOlderThan.mock.invocationCallOrder[0],
      )
    })

    it('returns 500 and surfaces the error when cleanup throws (errors are not swallowed)', async () => {
      mockDeleteOlderThan.mockRejectedValueOnce(new Error('sanity down'))
      const { GET } = await import('@/app/api/cron/cleanup-notifications/route')

      const response = await GET(cronRequest('Bearer test-cron-secret'))
      expect(response.status).toBe(500)

      const data = await response.json()
      expect(data.error).toBe('Internal server error')
      expect(data.details).toBe('sanity down')
    })
  })
})
