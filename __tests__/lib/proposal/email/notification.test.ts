import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { sendAcceptRejectNotification } from '@/lib/proposal/email/notification'
import type { NotificationParams } from '@/lib/proposal/email/types'
import { Action } from '@/lib/proposal/types'
import { resend } from '@/lib/email/config'

// Only the external boundary (the Resend client) is mocked; templates and
// the retry helper run for real so their integration is covered
vi.mock('@/lib/email/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email/config')>()
  return {
    ...actual,
    resend: {
      emails: {
        send: vi.fn(),
      },
    },
  }
})

const mockSendEmail = vi.mocked(resend.emails.send)

function lastSentMarkup(): string {
  const lastCall = mockSendEmail.mock.calls.at(-1)
  if (!lastCall) throw new Error('resend.emails.send was not called')
  return renderToStaticMarkup((lastCall[0] as { react: ReactElement }).react)
}

function createParams(
  overrides: Partial<NotificationParams> = {},
): NotificationParams {
  return {
    action: Action.accept,
    speaker: {
      name: 'Test Speaker',
      email: 'speaker@example.com',
    },
    proposal: {
      _id: 'proposal-1',
      title: 'Test Proposal',
    },
    comment: 'Well done',
    event: {
      location: 'Bergen',
      date: '1 October 2026',
      name: 'Cloud Native Day',
      url: 'https://example.com',
      organizer: 'CNDN',
      socialLinks: [],
      contactEmail: 'contact@example.com',
    },
    ...overrides,
  }
}

describe('sendAcceptRejectNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmail.mockResolvedValue({
      data: { id: 'email-id' },
      error: null,
    } as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('throws for invalid actions', async () => {
    await expect(
      sendAcceptRejectNotification(createParams({ action: Action.submit })),
    ).rejects.toThrow('Invalid action for notification: submit')
  })

  it('sends the accept email to the given speaker with a confirm URL', async () => {
    const result = await sendAcceptRejectNotification(createParams())

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'CNDN <contact@example.com>',
        to: ['speaker@example.com'],
        subject: '🎉 Your proposal has been accepted for Cloud Native Day',
      }),
    )
    const markup = lastSentMarkup()
    expect(markup).toContain('Test Speaker')
    expect(markup).toContain('Test Proposal')
    expect(markup).toContain('https://example.com/cfp/list?confirm=proposal-1')
    expect(result).toEqual({ id: 'email-id' })
  })

  it('uses the accept template with confirm URL for remind action', async () => {
    await sendAcceptRejectNotification(createParams({ action: Action.remind }))

    expect(lastSentMarkup()).toContain(
      'https://example.com/cfp/list?confirm=proposal-1',
    )
  })

  it('personalizes the greeting with the recipient speaker name', async () => {
    await sendAcceptRejectNotification(
      createParams({
        action: Action.reject,
        speaker: { name: 'Co Speaker', email: 'co@example.com' },
      }),
    )

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ['co@example.com'] }),
    )
    expect(lastSentMarkup()).toContain('Co Speaker')
  })

  it('uses the waitlist template for waitlist action', async () => {
    await sendAcceptRejectNotification(
      createParams({ action: Action.waitlist }),
    )

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Your proposal has been waitlisted for Cloud Native Day',
      }),
    )
    expect(lastSentMarkup()).toContain('Test Speaker')
  })

  it('throws when resend returns a non-retryable error', async () => {
    mockSendEmail.mockResolvedValue({
      data: null,
      error: { message: 'invalid recipient', name: 'validation_error' },
    } as never)

    await expect(sendAcceptRejectNotification(createParams())).rejects.toThrow(
      'Failed to send email: invalid recipient',
    )
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  it('retries rate-limited sends with backoff and succeeds', async () => {
    vi.useFakeTimers()
    mockSendEmail
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Too many requests', name: 'rate_limit_exceeded' },
      } as never)
      .mockResolvedValueOnce({
        data: { id: 'email-retry' },
        error: null,
      } as never)

    const promise = sendAcceptRejectNotification(createParams())
    await vi.advanceTimersByTimeAsync(500)

    await expect(promise).resolves.toEqual({ id: 'email-retry' })
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
  })
})
