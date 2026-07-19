/**
 * @vitest-environment node
 *
 * Unit tests for the messaging email fan-out (src/lib/messaging/email.ts):
 * - bounded concurrency (A8): never more than 3 sends in flight at once, so a
 *   large recipient set no longer serializes behind a per-recipient delay;
 * - never-fail: a per-recipient failure is logged and excluded from the count,
 *   but never throws and never abandons the other recipients.
 *
 * Only the Resend transport boundary is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()

vi.mock('@/lib/email/config', () => ({
  resend: { emails: { send: (...args: unknown[]) => sendMock(...args) } },
  // Pass-through: exercise sendOne's own success/failure handling directly.
  retryWithBackoff: async (fn: () => Promise<unknown>) => fn(),
}))

import {
  sendMessageEmails,
  type MessageEmailRecipient,
} from '@/lib/messaging/email'
import type { Conference } from '@/lib/conference/types'

const conference = {
  organizer: 'CNDN',
  cfpEmail: 'cfp@cndn.no',
  title: 'CNDN',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-09-01',
  domains: ['cndn.no'],
  socialLinks: [],
} as unknown as Conference

const context = { authorName: 'A', subject: 'S', excerpt: 'E', conference }

function recipients(n: number): MessageEmailRecipient[] {
  return Array.from({ length: n }, (_, i) => ({
    email: `r${i}@x.no`,
    name: `R${i}`,
    replyUrl: 'https://cndn.no/cfp/proposal/p1#messages',
  }))
}

beforeEach(() => {
  sendMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('sendMessageEmails — bounded concurrency (A8)', () => {
  it('delivers to every recipient and returns the delivered count', async () => {
    sendMock.mockResolvedValue({ error: null })
    const sent = await sendMessageEmails(recipients(5), context)
    expect(sent).toBe(5)
    expect(sendMock).toHaveBeenCalledTimes(5)
  })

  it('never runs more than 3 sends concurrently', async () => {
    let inFlight = 0
    let maxInFlight = 0
    sendMock.mockImplementation(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight--
      return { error: null }
    })

    await sendMessageEmails(recipients(9), context)

    expect(maxInFlight).toBeLessThanOrEqual(3)
    // ...and it IS concurrent (not a serial loop).
    expect(maxInFlight).toBeGreaterThan(1)
  })

  it('never throws; counts only successes and logs per-recipient failures', async () => {
    sendMock
      .mockResolvedValueOnce({ error: null }) // ok
      .mockRejectedValueOnce(new Error('boom')) // transport reject
      .mockResolvedValueOnce({ error: { message: 'bad' } }) // API error result
      .mockResolvedValue({ error: null }) // ok

    const sent = await sendMessageEmails(recipients(4), context)

    expect(sent).toBe(2)
    expect(console.error).toHaveBeenCalled()
  })
})
