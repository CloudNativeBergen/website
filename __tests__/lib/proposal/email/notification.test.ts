import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendAcceptRejectNotification } from '@/lib/proposal/email/notification'
import type { NotificationParams } from '@/lib/proposal/email/types'
import { Action } from '@/lib/proposal/types'
import { resend } from '@/lib/email/config'
import {
  ProposalAcceptTemplate,
  ProposalRejectTemplate,
  ProposalWaitlistTemplate,
} from '@/components/email'

vi.mock('@/lib/email/config', () => ({
  resend: {
    emails: {
      send: vi.fn(),
    },
  },
}))

vi.mock('@/components/email', () => ({
  ProposalAcceptTemplate: vi.fn(() => 'accept-template'),
  ProposalRejectTemplate: vi.fn(() => 'reject-template'),
  ProposalWaitlistTemplate: vi.fn(() => 'waitlist-template'),
}))

const mockSendEmail = vi.mocked(resend.emails.send)

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
    expect(ProposalAcceptTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        speakerName: 'Test Speaker',
        proposalTitle: 'Test Proposal',
        confirmUrl: 'https://example.com/cfp/list?confirm=proposal-1',
      }),
    )
    expect(result).toEqual({ id: 'email-id' })
  })

  it('uses the accept template with confirm URL for remind action', async () => {
    await sendAcceptRejectNotification(createParams({ action: Action.remind }))

    expect(ProposalAcceptTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmUrl: 'https://example.com/cfp/list?confirm=proposal-1',
      }),
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
    expect(ProposalRejectTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ speakerName: 'Co Speaker' }),
    )
  })

  it('uses the waitlist template for waitlist action', async () => {
    await sendAcceptRejectNotification(
      createParams({ action: Action.waitlist }),
    )

    expect(ProposalWaitlistTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ speakerName: 'Test Speaker' }),
    )
  })

  it('throws when resend returns an error', async () => {
    mockSendEmail.mockResolvedValue({
      data: null,
      error: { message: 'rate limited', name: 'rate_limit_exceeded' },
    } as never)

    await expect(sendAcceptRejectNotification(createParams())).rejects.toThrow(
      'Failed to send email: rate limited',
    )
  })
})
