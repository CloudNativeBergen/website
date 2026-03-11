/**
 * @vitest-environment node
 */
import { NextRequest } from 'next/server'

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockSanityFetch = vi.fn<(...args: any[]) => any>()
const mockPatch = vi.fn<(...args: any[]) => any>()
const mockSet = vi.fn<(...args: any[]) => any>()
const mockCommit = vi.fn<(...args: any[]) => any>()
const mockCreate = vi.fn<(...args: any[]) => any>()
const mockResendSend = vi.fn<(...args: any[]) => any>()

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: (...args: unknown[]) => mockSanityFetch(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
}))

vi.mock('@/lib/time', () => ({
  getCurrentDateTime: () => '2026-01-15T10:00:00Z',
  formatConferenceDateLong: (date: string) => date,
}))

vi.mock('@/lib/email/config', () => ({
  resend: {
    emails: {
      send: (...args: unknown[]) => mockResendSend(...args),
    },
  },
  retryWithBackoff: async (fn: () => Promise<unknown>) => fn(),
}))

vi.mock('@/lib/email/contract-email', () => ({
  renderContractEmail: vi.fn<(...args: any[]) => any>().mockResolvedValue({
    subject: 'Reminder: Sponsorship Agreement',
    react: null,
  }),
  CONTRACT_EMAIL_SLUGS: {
    SENT: 'contract-sent',
    REMINDER: 'contract-reminder',
    SIGNED: 'contract-signed',
  },
}))

vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
}))

describe('api/cron/contract-reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-cron-secret'

    mockPatch.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ commit: mockCommit })
    mockCommit.mockResolvedValue({})
    mockCreate.mockResolvedValue({})
    mockResendSend.mockResolvedValue({ data: { id: 'email-123' } })
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
  })

  function cronRequest(authHeader?: string): NextRequest {
    return new NextRequest(
      'http://localhost:3000/api/cron/contract-reminders',
      {
        headers: authHeader ? { authorization: authHeader } : {},
      },
    )
  }

  describe('Authentication', () => {
    it('returns 401 without authorization header', async () => {
      const { GET } = await import('@/app/api/cron/contract-reminders/route')

      const response = await GET(cronRequest())
      expect(response.status).toBe(401)
    })

    it('returns 401 with wrong token', async () => {
      const { GET } = await import('@/app/api/cron/contract-reminders/route')

      const response = await GET(cronRequest('Bearer wrong-secret'))
      expect(response.status).toBe(401)
    })

    it('returns 500 when CRON_SECRET is not set', async () => {
      delete process.env.CRON_SECRET
      const { GET } = await import('@/app/api/cron/contract-reminders/route')

      const response = await GET(cronRequest('Bearer test-cron-secret'))
      expect(response.status).toBe(500)
    })
  })

  describe('Reminder Processing', () => {
    it('returns success with 0 sent when no pending contracts', async () => {
      const { GET } = await import('@/app/api/cron/contract-reminders/route')

      mockSanityFetch.mockResolvedValueOnce([])

      const response = await GET(cronRequest('Bearer test-cron-secret'))
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.sent).toBe(0)
    })

    it('sends reminders and updates reminder count', async () => {
      const { GET } = await import('@/app/api/cron/contract-reminders/route')

      mockSanityFetch.mockResolvedValueOnce([
        {
          _id: 'sfc-1',
          signatureId: 'agr-001',
          signingUrl: 'https://sign.example.com/1',
          signerEmail: 'signer1@example.com',
          reminderCount: 0,
          sponsorName: 'Acme Corp',
          conferenceName: 'Cloud Native Day 2026',
          conferenceCity: 'Oslo',
          conferenceStartDate: '2026-06-15',
          conferenceSponsorEmail: 'sponsors@example.com',
          conferenceOrganizer: 'Cloud Native Days',
        },
        {
          _id: 'sfc-2',
          signatureId: 'agr-002',
          signingUrl: 'https://sign.example.com/2',
          signerEmail: 'signer2@example.com',
          reminderCount: 1,
          sponsorName: 'Beta Inc',
          conferenceName: 'Cloud Native Day 2026',
          conferenceCity: 'Oslo',
          conferenceStartDate: '2026-06-15',
          conferenceSponsorEmail: 'sponsors@example.com',
          conferenceOrganizer: 'Cloud Native Days',
        },
      ])

      const response = await GET(cronRequest('Bearer test-cron-secret'))
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.total).toBe(2)
      expect(data.sent).toBe(2)
      expect(data.failed).toBe(0)

      // Verify emails sent
      expect(mockResendSend).toHaveBeenCalledTimes(2)
      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['signer1@example.com'],
          subject: expect.stringContaining('Reminder'),
        }),
      )

      // Verify reminder count was incremented
      expect(mockPatch).toHaveBeenCalledWith('sfc-1')
      expect(mockPatch).toHaveBeenCalledWith('sfc-2')
      expect(mockSet).toHaveBeenCalledWith({ reminderCount: 1 })
      expect(mockSet).toHaveBeenCalledWith({ reminderCount: 2 })

      // Verify activity logs created
      expect(mockCreate).toHaveBeenCalledTimes(2)
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          _type: 'sponsorActivity',
          activityType: 'contract_reminder_sent',
        }),
      )
    })

    it('handles partial failures gracefully', async () => {
      const { GET } = await import('@/app/api/cron/contract-reminders/route')

      mockSanityFetch.mockResolvedValueOnce([
        {
          _id: 'sfc-1',
          signatureId: 'agr-ok',
          signingUrl: 'https://sign.example.com/ok',
          signerEmail: 'ok@example.com',
          reminderCount: 0,
          sponsorName: 'Good Corp',
          conferenceName: 'Cloud Native Day',
          conferenceCity: 'Oslo',
        },
        {
          _id: 'sfc-2',
          signatureId: 'agr-bad',
          signingUrl: 'https://sign.example.com/bad',
          signerEmail: 'bad@example.com',
          reminderCount: 0,
          sponsorName: 'Bad Corp',
          conferenceName: 'Cloud Native Day',
          conferenceCity: 'Oslo',
        },
      ])

      // First email succeeds + commit succeeds, second email throws
      mockResendSend
        .mockResolvedValueOnce({ data: { id: 'ok' } })
        .mockRejectedValueOnce(new Error('Resend error'))

      const response = await GET(cronRequest('Bearer test-cron-secret'))
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.sent).toBe(1)
      expect(data.failed).toBe(1)
    })

    it('queries Sanity with correct threshold parameters', async () => {
      const { GET } = await import('@/app/api/cron/contract-reminders/route')

      mockSanityFetch.mockResolvedValueOnce([])

      await GET(cronRequest('Bearer test-cron-secret'))

      expect(mockSanityFetch).toHaveBeenCalledWith(
        expect.stringContaining('signatureStatus == "pending"'),
        expect.objectContaining({ maxReminders: 2 }),
      )
    })

    it('skips contract entirely when signingUrl or signerEmail is missing', async () => {
      const { GET } = await import('@/app/api/cron/contract-reminders/route')

      mockSanityFetch.mockResolvedValueOnce([
        {
          _id: 'sfc-no-url',
          signatureId: 'agr-no-url',
          signingUrl: null,
          signerEmail: 'signer@example.com',
          reminderCount: 0,
          sponsorName: 'No URL Corp',
          conferenceName: 'Cloud Native Day',
        },
      ])

      const response = await GET(cronRequest('Bearer test-cron-secret'))
      const data = await response.json()

      // Should count as failed, not sent
      expect(data.sent).toBe(0)
      expect(data.failed).toBe(1)
      expect(mockResendSend).not.toHaveBeenCalled()
      // Should NOT increment reminder count
      expect(mockPatch).not.toHaveBeenCalled()
      expect(mockCreate).not.toHaveBeenCalled()
    })
  })
})
