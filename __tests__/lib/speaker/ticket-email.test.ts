/**
 * @vitest-environment node
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { resend } from '@/lib/email/config'
import { sendSpeakerTicketEmail } from '@/lib/speaker/ticket-email'
import { createMockConference } from '../../testdata/conference'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const baseParams = {
  speaker: { name: 'Ada Lovelace', email: 'ada@example.com' },
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

/**
 * THE LINK IS THE WHOLE POINT OF THIS EMAIL, so these assert on the HTML Resend
 * would actually deliver, not on the params we passed in.
 *
 * Before this, the handler built `https://event.checkin.no/<eventId>?ticket=
 * <id>` — a plain store deep link with no invitation code, which grants nothing
 * against an invitation-gated ticket type. Every confirmed speaker got two
 * emails: Checkin's, which worked, and ours, which looked more official and led
 * nowhere. Unconfigured, ours now carries no link at all.
 */
describe('the speaker ticket email body', () => {
  /** Render exactly the element handed to Resend. */
  async function renderSent(
    params: Parameters<typeof sendSpeakerTicketEmail>[0],
  ): Promise<string> {
    let sent: ReactElement | undefined
    vi.spyOn(resend.emails, 'send').mockImplementation(async (payload) => {
      sent = (payload as { react?: ReactElement }).react
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { data: { id: 'email-1' }, error: null } as any
    })

    await sendSpeakerTicketEmail(params)
    if (!sent) throw new Error('Resend was called without a React template')
    return renderToStaticMarkup(sent)
  }

  const INVITE_LINK =
    'https://event.checkin.no/4242?action=invite&category=222222&pass=FAKE-SPEAKER-TOKEN'

  it('carries exactly the configured invite link as its call to action', async () => {
    const html = await renderSent({
      ...baseParams,
      registrationUrl: INVITE_LINK,
    })

    // `&` is HTML-escaped in an attribute; the URL a mail client resolves is
    // byte-for-byte the configured one.
    const escaped = INVITE_LINK.replaceAll('&', '&amp;')
    expect(html).toContain(`href="${escaped}"`)
    expect(html).toContain('Claim Your Speaker Ticket')
    // No store deep link is synthesised alongside it.
    expect(html).not.toContain('?ticket=')
  })

  it('carries NO Checkin URL at all when no invite link is configured', async () => {
    const html = await renderSent({
      ...baseParams,
      registrationUrl: undefined,
    })

    expect(html).not.toContain('checkin.no')
    expect(html).not.toContain('?ticket=')
    expect(html).not.toContain('Claim Your Speaker Ticket')
    // And it tells the speaker where the working invitation actually is.
    expect(html).toContain('invitation has been sent to this address')
  })
})
