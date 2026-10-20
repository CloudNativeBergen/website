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
}))

vi.mock('./config', async (original) => ({
  ...(await original<typeof import('./config')>()),
  resolveEmailSender: async (orgId: unknown) => {
    h.orgIds.push(orgId)
    return { client: { emails: { send: h.send } } }
  },
}))

import { sendFeedbackSummaryEmail } from './feedback-summary'

const request = () => ({
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

const sent = () => h.send.mock.calls[0][0] as Record<string, string>

beforeEach(() => {
  h.send.mockReset()
  h.send.mockResolvedValue({ data: { id: 'email-1' }, error: null })
  h.orgIds = []
})

describe('sendFeedbackSummaryEmail', () => {
  it('sends speaker mail in the conference’s name, through its own tenant’s sender', async () => {
    await sendFeedbackSummaryEmail(request())
    expect(h.orgIds).toEqual(['org-A'])
    expect(sent()).toMatchObject({
      from: 'Conf A Org <cfp@a.example.com>',
      to: 'ada@example.com',
      subject: 'Your Session Feedback for “Kubernetes at the edge”',
    })
  })

  it('carries the combined totals, the response and comment counts and the link', async () => {
    await sendFeedbackSummaryEmail(request())
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

  it('throws when Resend refuses it, so the caller logs it', async () => {
    h.send.mockResolvedValue({
      data: null,
      error: { message: 'Invalid `to` field', name: 'validation_error' },
    })
    await expect(sendFeedbackSummaryEmail(request())).rejects.toThrow(
      'Invalid `to` field',
    )
  })
})
