import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EventTicket } from '@/lib/tickets/types'

const resolveTicketingProviderMock = vi.fn()
vi.mock('@/lib/tickets/provider', () => ({
  resolveTicketingProvider: (...a: unknown[]) =>
    resolveTicketingProviderMock(...a),
}))

import {
  redeemedSpeakerEmails,
  joinSpeakerTicketStatus,
  fetchRedeemedSpeakerEmails,
  __resetRedeemedCache,
} from './speakerStatus'

function ticket(email: string | null, category: string): EventTicket {
  return { category, crm: { email } } as unknown as EventTicket
}

const CONF = {
  checkinCustomerId: 42,
  checkinEventId: 7,
  organization: { _ref: 'org-xyz' },
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetRedeemedCache()
})

describe('redeemedSpeakerEmails — the category narrowing', () => {
  it('counts only the speaker-ticket category', () => {
    const emails = redeemedSpeakerEmails([
      ticket('claimed@x.test', 'Speaker ticket'),
      ticket('bought@x.test', 'Workshop + Conference (2 days)'),
      ticket('regular@x.test', 'Conference (1 day)'),
    ])
    expect([...emails]).toEqual(['claimed@x.test'])
    // The load-bearing half: an ordinary ticket leaves the comp unclaimed,
    // which is the thing being chased.
    expect(emails.has('bought@x.test')).toBe(false)
    expect(emails.has('regular@x.test')).toBe(false)
  })

  it('normalizes case and whitespace on the ticket side', () => {
    const emails = redeemedSpeakerEmails([
      ticket('  Claimed@X.Test ', 'Speaker ticket'),
    ])
    expect([...emails]).toEqual(['claimed@x.test'])
  })

  it('does not throw on a null or blank contact email, and never matches one', () => {
    const emails = redeemedSpeakerEmails([
      ticket(null, 'Speaker ticket'),
      ticket('   ', 'Speaker ticket'),
      ticket('real@x.test', 'Speaker ticket'),
    ])
    expect([...emails]).toEqual(['real@x.test'])
    const [status] = joinSpeakerTicketStatus(
      [{ speakerId: 's1', emails: [null, '', undefined], invitedAt: null }],
      emails,
    )
    expect(status.state).toBe('not-invited')
  })
})

describe('joinSpeakerTicketStatus — the three states', () => {
  const redeemed = new Set(['claimed@x.test'])

  it('reports not-invited when no invitation was ever recorded', () => {
    expect(
      joinSpeakerTicketStatus(
        [{ speakerId: 's1', emails: ['nobody@x.test'], invitedAt: null }],
        redeemed,
      ),
    ).toEqual([{ speakerId: 's1', state: 'not-invited', invitedAt: undefined }])
  })

  it('reports invited (with the send date) when the invitation went out and no ticket exists', () => {
    expect(
      joinSpeakerTicketStatus(
        [
          {
            speakerId: 's1',
            emails: ['nobody@x.test'],
            invitedAt: '2026-03-01T10:00:00Z',
          },
        ],
        redeemed,
      ),
    ).toEqual([
      { speakerId: 's1', state: 'invited', invitedAt: '2026-03-01T10:00:00Z' },
    ])
  })

  it('matches on a verified knownEmails address, not only the display email', () => {
    const [status] = joinSpeakerTicketStatus(
      [
        {
          speakerId: 's1',
          emails: ['display@x.test', 'CLAIMED@X.test'],
          invitedAt: '2026-03-01T10:00:00Z',
        },
      ],
      redeemed,
    )
    expect(status.state).toBe('redeemed')
  })

  it('matches on the issued-snapshot address the invitation was sent to', () => {
    const [status] = joinSpeakerTicketStatus(
      // Display email has since changed; only the snapshot address holds a ticket.
      [
        {
          speakerId: 's1',
          emails: ['new-address@x.test', 'claimed@x.test'],
          invitedAt: '2026-03-01T10:00:00Z',
        },
      ],
      redeemed,
    )
    expect(status.state).toBe('redeemed')
  })
})

describe('provider failure is UNKNOWN, never unredeemed', () => {
  it('maps every speaker to unknown when the redeemed set is null', () => {
    const statuses = joinSpeakerTicketStatus(
      [
        { speakerId: 's1', emails: ['a@x.test'], invitedAt: null },
        {
          speakerId: 's2',
          emails: ['b@x.test'],
          invitedAt: '2026-03-01T00:00:00Z',
        },
      ],
      null,
    )
    expect(statuses.map((s) => s.state)).toEqual(['unknown', 'unknown'])
    // Specifically NOT the states a working provider would have produced.
    expect(statuses.map((s) => s.state)).not.toContain('not-invited')
    expect(statuses.map((s) => s.state)).not.toContain('invited')
  })

  it('fetchRedeemedSpeakerEmails returns null when the provider throws', async () => {
    resolveTicketingProviderMock.mockResolvedValue({
      configured: true,
      provider: {
        fetchEventTickets: vi.fn().mockRejectedValue(new Error('upstream 503')),
      },
      eventRef: { customerId: 42, eventId: 7 },
    })
    await expect(fetchRedeemedSpeakerEmails(CONF)).resolves.toBeNull()
  })

  it('returns null — not an empty set — when ticketing is unconfigured', async () => {
    resolveTicketingProviderMock.mockResolvedValue({
      configured: false,
      provider: null,
      eventRef: null,
    })
    await expect(fetchRedeemedSpeakerEmails(CONF)).resolves.toBeNull()
  })

  it('fails closed without an owning organization, without touching the provider', async () => {
    await expect(
      fetchRedeemedSpeakerEmails({ ...CONF, organization: null }),
    ).resolves.toBeNull()
    expect(resolveTicketingProviderMock).not.toHaveBeenCalled()
  })
})

describe('the 30s memo', () => {
  it('fetches the event once for repeated calls, and keys on the org', async () => {
    const fetchEventTickets = vi
      .fn()
      .mockResolvedValue([ticket('claimed@x.test', 'Speaker ticket')])
    resolveTicketingProviderMock.mockResolvedValue({
      configured: true,
      provider: { fetchEventTickets },
      eventRef: { customerId: 42, eventId: 7 },
    })

    await fetchRedeemedSpeakerEmails(CONF)
    await fetchRedeemedSpeakerEmails(CONF)
    expect(fetchEventTickets).toHaveBeenCalledTimes(1)

    // Same provider ids, DIFFERENT account: Checkin ids are unique only within
    // an account, so this must not be served the first org's answer.
    await fetchRedeemedSpeakerEmails({
      ...CONF,
      organization: { _ref: 'org-other' },
    })
    expect(fetchEventTickets).toHaveBeenCalledTimes(2)
  })

  it('does not cache a rejection', async () => {
    const fetchEventTickets = vi
      .fn()
      .mockRejectedValueOnce(new Error('upstream 503'))
      .mockResolvedValueOnce([ticket('claimed@x.test', 'Speaker ticket')])
    resolveTicketingProviderMock.mockResolvedValue({
      configured: true,
      provider: { fetchEventTickets },
      eventRef: { customerId: 42, eventId: 7 },
    })

    expect(await fetchRedeemedSpeakerEmails(CONF)).toBeNull()
    expect([...(await fetchRedeemedSpeakerEmails(CONF))!]).toEqual([
      'claimed@x.test',
    ])
  })
})
