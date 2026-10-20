/**
 * @vitest-environment node
 *
 * The summary email (speaker feedback spec §11.1): rendered by the real
 * template; only the Resend client is replaced, at `resolveEmailSender`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedbackTotals } from '@/lib/feedback/totals'

const h = vi.hoisted(() => ({
  send: vi.fn(),
  orgIds: [] as unknown[],
  /** The org has no Resend account of its own: the shared platform one. */
  onPlatform: false,
}))

vi.mock('./config', async (original) => {
  const real = await original<typeof import('./config')>()
  return {
    ...real,
    resolveEmailSender: async (orgId: unknown) => {
      h.orgIds.push(orgId)
      return {
        client: { emails: { send: h.send } },
        platform: h.onPlatform,
      }
    },
  }
})

import {
  FEEDBACK_SUMMARY_EMAIL_WORST_CASE_MS,
  isOutcomeUnknown,
  isRecipientRefusal,
  resolveFeedbackSummarySender,
  sendFeedbackSummaryEmail,
  type FeedbackSummaryEmail,
} from './feedback-summary'

const request = () => ({
  talkId: 'talk-1',
  speakerId: 'sp-1',
  to: 'ada@example.com',
  speakerName: 'Ada Lovelace',
  talkTitle: 'Kubernetes at the edge',
  totals: feedbackTotals({
    live: { green: 12, yellow: 3, red: 1 },
    cards: { greenCount: 4, yellowCount: 0, redCount: 1 },
  }),
  comments: 4,
  resultsUrl: 'https://a.example.com/cfp/proposal/talk-1#session-feedback',
  conference: {
    title: 'Conf A',
    organizer: 'Conf A Org',
    cfpEmail: 'cfp@a.example.com',
    domains: ['a.example.com'],
    city: 'Bergen',
    country: 'Norway',
    startDate: '2026-06-10',
    organization: { _type: 'reference' as const, _ref: 'org-A' },
  },
})

/** A send through the conference's own sender, resolved as the cron does. */
const send = async (over: Partial<FeedbackSummaryEmail> = {}): Promise<void> =>
  sendFeedbackSummaryEmail({
    ...request(),
    sender: await resolveFeedbackSummarySender(request().conference),
    ...over,
  })

const sent = () => h.send.mock.calls[0][0] as Record<string, string>

beforeEach(() => {
  h.onPlatform = false
  h.send.mockReset()
  h.send.mockResolvedValue({ data: { id: 'email-1' }, error: null })
  h.orgIds = []
})

describe('sendFeedbackSummaryEmail', () => {
  it('sends speaker mail in the conference’s name, through its own tenant’s sender', async () => {
    await send()
    expect(h.orgIds).toEqual(['org-A'])
    expect(sent()).toMatchObject({
      from: 'Conf A Org <cfp@a.example.com>',
      to: 'ada@example.com',
      subject: 'Your Session Feedback for “Kubernetes at the edge”',
    })
  })

  it('carries the combined totals, the response and comment counts and the link', async () => {
    await send()
    const html = sent().html
    // Combined: 16 green, 3 yellow, 2 red; 21 responses, 5 of them cards.
    expect(html).toMatch(/>16<\/div><div[^>]*>Loved it</)
    expect(html).toMatch(/>3<\/div><div[^>]*>It was OK</)
    expect(html).toMatch(/>2<\/div><div[^>]*>Not for me</)
    expect(html).toContain('21 responses')
    expect(html).toContain('4 comments')
    expect(html).toContain('Including 5 feedback cards')
    expect(html).toContain(
      'href="https://a.example.com/cfp/proposal/talk-1#session-feedback"',
    )
    expect(html).toMatch(/Dear (<!-- -->)?Ada Lovelace/)
  })

  it('backs off and tries again when Resend answers with a rate limit', async () => {
    h.send
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Too many requests',
          name: 'rate_limit_exceeded',
          statusCode: 429,
        },
      })
      .mockResolvedValueOnce({ data: { id: 'email-1' }, error: null })
    await send()
    expect(h.send).toHaveBeenCalledTimes(2)
  })

  it('sends a retry under the same idempotency key, one per talk and speaker, so a lost reply cannot mean two emails', async () => {
    h.send
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Internal server error',
          name: 'internal_server_error',
          statusCode: 500,
        },
      })
      .mockResolvedValueOnce({ data: { id: 'email-1' }, error: null })
    await send()
    expect(h.send).toHaveBeenCalledTimes(2)
    const keys = h.send.mock.calls.map(
      (call) =>
        (call[1] as { idempotencyKey?: string } | undefined)?.idempotencyKey,
    )
    expect(keys).toEqual([
      'feedback-summary/talk-1/sp-1',
      'feedback-summary/talk-1/sp-1',
    ])
  })

  it('retries while Resend is still processing the first attempt under that key', async () => {
    h.send
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Same idempotency key in progress',
          name: 'concurrent_idempotent_requests',
          statusCode: 409,
        },
      })
      .mockResolvedValueOnce({ data: { id: 'email-1' }, error: null })
    await send()
    expect(h.send).toHaveBeenCalledTimes(2)
  })

  it('keeps the key within Resend’s 256 characters for the longest ids', async () => {
    await send({
      talkId: 't'.repeat(128),
      speakerId: 's'.repeat(128),
    })
    const key = (h.send.mock.calls[0][1] as { idempotencyKey: string })
      .idempotencyKey
    expect(key.length).toBeLessThanOrEqual(256)
    expect(key).toMatch(/^feedback-summary\//)
  })

  it('does not retry a permanent refusal', async () => {
    h.send.mockResolvedValue({
      data: null,
      error: {
        message: 'Invalid `to` field',
        name: 'validation_error',
        statusCode: 422,
      },
    })
    await expect(send()).rejects.toThrow()
    expect(h.send).toHaveBeenCalledTimes(1)
  })

  it('greets a speaker with no name neutrally instead of failing to render', async () => {
    await send({ speakerName: '  ' })
    expect(sent().html).toMatch(/Dear (<!-- -->)?speaker(<!-- -->)?,/)
  })

  it('greets a speaker whose name is only invisible characters neutrally', async () => {
    await send({ speakerName: '\u200D\u2060\u00AD\u200B' })
    expect(sent().html).toMatch(/Dear (<!-- -->)?speaker(<!-- -->)?,/)
  })

  it('gives up on a send that hangs, after the retries, instead of hanging the run', async () => {
    vi.useFakeTimers()
    try {
      h.send.mockReturnValue(new Promise(() => {}))
      const pending = send()
      const outcome = pending.then(
        () => 'sent',
        (error: Error) => error.message,
      )
      await vi.advanceTimersByTimeAsync(FEEDBACK_SUMMARY_EMAIL_WORST_CASE_MS)
      expect(await outcome).toMatch(/timed out/)
      // Each attempt under the same key, so one that did land is not doubled.
      expect(h.send).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('throws when Resend refuses it, so the caller logs it', async () => {
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'Invalid `to` field', name: 'validation_error' },
    })
    await expect(send()).rejects.toThrow('Invalid `to` field')
  })
})

describe('resolveFeedbackSummarySender', () => {
  it('names the sender by its account and its From, so a breaker can stop exactly that one', async () => {
    const sender = await resolveFeedbackSummarySender(request().conference)
    expect(sender.key).toBe('org-A|Conf A Org <cfp@a.example.com>')
    const other = await resolveFeedbackSummarySender({
      ...request().conference,
      cfpEmail: 'cfp@other.example.com',
    })
    expect(other.key).not.toBe(sender.key)
  })

  it('names a sender on the shared platform account by that account, whichever org it is', async () => {
    h.onPlatform = true
    const a = await resolveFeedbackSummarySender(request().conference)
    const b = await resolveFeedbackSummarySender({
      ...request().conference,
      organization: { _type: 'reference', _ref: 'org-B' },
    })
    expect(a.key).toBe('platform|Conf A Org <cfp@a.example.com>')
    expect(b.key).toBe(a.key)
  })
})

describe('isOutcomeUnknown', () => {
  it('is Resend still processing an earlier attempt under the same key', () => {
    const inProgress = Object.assign(new Error('in progress'), {
      resendErrorName: 'concurrent_idempotent_requests',
      status: 409,
    })
    expect(isOutcomeUnknown(inProgress)).toBe(true)
    expect(
      isOutcomeUnknown(
        Object.assign(new Error('x'), { resendErrorName: 'invalid_api_key' }),
      ),
    ).toBe(false)
  })
})

describe('FEEDBACK_SUMMARY_EMAIL_WORST_CASE_MS', () => {
  it('stays small enough for a talk of several speakers inside one run', () => {
    // Three attempts, each cut off, plus the backoff between them and the
    // pause before the send: under 35 s, so a 5-speaker talk fits in 3 min.
    expect(FEEDBACK_SUMMARY_EMAIL_WORST_CASE_MS).toBeLessThanOrEqual(35_000)
  })
})

describe('isRecipientRefusal', () => {
  const refusal = (name: string, status: number) =>
    Object.assign(new Error(name), { resendErrorName: name, status })

  it('is a 422 about the request (a bad address), and nothing about the sender', () => {
    expect(isRecipientRefusal(refusal('validation_error', 422))).toBe(true)
    expect(isRecipientRefusal(refusal('invalid_parameter', 422))).toBe(true)
    // An unverified domain is a 403 validation_error: the sender's fault.
    expect(isRecipientRefusal(refusal('validation_error', 403))).toBe(false)
    expect(isRecipientRefusal(refusal('invalid_from_address', 422))).toBe(false)
    expect(isRecipientRefusal(refusal('invalid_api_key', 401))).toBe(false)
    expect(isRecipientRefusal(refusal('daily_quota_exceeded', 429))).toBe(false)
    expect(isRecipientRefusal(new Error('fetch failed'))).toBe(false)
  })
})
