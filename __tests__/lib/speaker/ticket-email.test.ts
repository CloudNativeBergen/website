/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { resend } from '@/lib/email/config'
import { sendSpeakerTicketEmail } from '@/lib/speaker/ticket-email'
import { createMockConference } from '../../testdata/conference'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const baseParams = {
  speaker: { name: 'Ada Lovelace', email: 'ada@example.com' },
  discountCode: 'SPEAKER-DEADBEEF',
  registrationUrl: 'https://2026.cloudnativedays.no',
  eventUrl: 'https://2026.cloudnativedays.no',
  conference: createMockConference(),
}

describe('sendSpeakerTicketEmail', () => {
  it('retries a transient provider 5xx and eventually succeeds', async () => {
    vi.useFakeTimers()
    let calls = 0
    const sendSpy = vi
      .spyOn(resend.emails, 'send')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(async () => {
        calls++
        if (calls < 3) {
          return {
            data: null,
            error: {
              message: 'Internal server error',
              name: 'internal_server_error',
              statusCode: 500,
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { data: { id: 'email-1' }, error: null } as any
      })

    const promise = sendSpeakerTicketEmail(baseParams)
    await vi.runAllTimersAsync()

    await expect(promise).resolves.toEqual({ id: 'email-1' })
    expect(sendSpy).toHaveBeenCalledTimes(3)
  })

  it('does not retry a permanent validation (4xx) error', async () => {
    const sendSpy = vi.spyOn(resend.emails, 'send').mockResolvedValue({
      data: null,
      error: {
        message: 'Invalid `to` field',
        name: 'validation_error',
        statusCode: 422,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(sendSpeakerTicketEmail(baseParams)).rejects.toThrow(
      /Invalid `to` field/,
    )
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })
})
