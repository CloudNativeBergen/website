import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EventTicket } from '@/lib/tickets/types'

const resolveTicketingProviderMock = vi.fn()
vi.mock('@/lib/tickets/provider', () => ({
  resolveTicketingProvider: (...a: unknown[]) =>
    resolveTicketingProviderMock(...a),
}))

import {
  redeemedSpeakerEmails,
  findSpeakerTicketType,
  joinSpeakerTicketStatus,
  fetchRedeemedSpeakerEmails,
  toTicketCandidates,
  searchTicketCandidates,
  __resetRedeemedCache,
  __resetSpeakerTicketTypeCache,
} from './speakerStatus'

function ticket(email: string | null, category: string): EventTicket {
  return { category, crm: { email } } as unknown as EventTicket
}

/** Provider tickets go through the same narrowing the live path applies. */
function redeemedFrom(tickets: EventTicket[], categories?: string[]) {
  return redeemedSpeakerEmails(toTicketCandidates(tickets), categories)
}

const CONF = {
  checkinCustomerId: 42,
  checkinEventId: 7,
  organization: { _ref: 'org-xyz' },
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetRedeemedCache()
  // The type lookup is memoized per org+event too, and every case here shares
  // one CONF — without this a case inherits the previous case's ticket type.
  __resetSpeakerTicketTypeCache()
})

/** A configured Checkin-shaped provider whose type list and tickets are given. */
function provider(opts: {
  types?: { id: number; name: string; requiresInvitation: boolean }[]
  tickets?: EventTicket[]
  canInvite?: boolean
}) {
  const fetchEventTickets = vi.fn().mockResolvedValue(opts.tickets ?? [])
  const fetchPublicTicketTypes = vi
    .fn()
    .mockResolvedValue({ event: {}, tickets: opts.types ?? [] })
  const p: Record<string, unknown> = {
    fetchEventTickets,
    fetchPublicTicketTypes,
  }
  if (opts.canInvite !== false) p.sendTicketInvitation = vi.fn()
  resolveTicketingProviderMock.mockResolvedValue({
    configured: true,
    provider: p,
    eventRef: { customerId: 42, eventId: 7 },
  })
  return { fetchEventTickets, fetchPublicTicketTypes }
}

describe('the speaker ticket CATEGORY is derived from the provider, not assumed', () => {
  // The rule issuance uses (`speakerTicket.ts`): invitation-gated + /speaker/i.
  it('picks the same type issuance would pick', () => {
    expect(
      findSpeakerTicketType([
        { name: 'Conference (1 day)', requiresInvitation: false },
        { name: 'Sponsor', requiresInvitation: true },
        { name: 'Speaker', requiresInvitation: true },
      ]),
    ).toEqual({ name: 'Speaker', requiresInvitation: true })
  })

  it('ignores a speaker-named type that is NOT invitation-gated', () => {
    expect(
      findSpeakerTicketType([
        { name: 'Speaker meetup', requiresInvitation: false },
      ]),
    ).toBeUndefined()
  })

  // THE BUG THIS EXISTS FOR: a tenant whose invite-only type is called
  // "Speaker" gets invitations sent and markers written, but every claimed
  // ticket lands in a category a hard-coded 'Speaker ticket' comparison
  // ignores — the whole programme reads Invited forever and the "not claimed"
  // filter lists exactly the people who DID claim, provider perfectly healthy.
  it('counts a claim under a RENAMED type ("Speaker")', async () => {
    provider({
      types: [{ id: 9, name: 'Speaker', requiresInvitation: true }],
      tickets: [ticket('claimed@x.test', 'Speaker')],
    })
    const redeemed = await fetchRedeemedSpeakerEmails(CONF)
    expect([...redeemed!]).toEqual(['claimed@x.test'])

    const [status] = joinSpeakerTicketStatus(
      [
        {
          speakerId: 's1',
          emails: ['claimed@x.test'],
          invitedAt: '2026-03-01T10:00:00Z',
        },
      ],
      redeemed,
    )
    expect(status.state).toBe('redeemed')
  })

  it('still counts the historical "Speaker ticket" literal after a rename', async () => {
    provider({
      types: [{ id: 9, name: 'Speaker', requiresInvitation: true }],
      tickets: [ticket('old@x.test', 'Speaker ticket')],
    })
    expect([...(await fetchRedeemedSpeakerEmails(CONF))!]).toEqual([
      'old@x.test',
    ])
  })

  it('is UNKNOWN — not "not claimed" — when no speaker type can be identified', async () => {
    const { fetchEventTickets } = provider({
      types: [{ id: 1, name: 'Conference', requiresInvitation: false }],
      tickets: [ticket('claimed@x.test', 'Speaker ticket')],
    })
    await expect(fetchRedeemedSpeakerEmails(CONF)).resolves.toBeNull()
    expect(fetchEventTickets).not.toHaveBeenCalled()
  })

  it('is UNKNOWN, and fetches nothing, when the provider cannot send invitations', async () => {
    // Issuance aborts on exactly this capability (Tito), so no marker can
    // exist — and the full paginated event fetch would buy no answer.
    const { fetchEventTickets, fetchPublicTicketTypes } = provider({
      canInvite: false,
      types: [{ id: 9, name: 'Speaker', requiresInvitation: true }],
      tickets: [ticket('claimed@x.test', 'Speaker ticket')],
    })
    await expect(fetchRedeemedSpeakerEmails(CONF)).resolves.toBeNull()
    expect(fetchEventTickets).not.toHaveBeenCalled()
    expect(fetchPublicTicketTypes).not.toHaveBeenCalled()
  })
})

describe('redeemedSpeakerEmails — the category narrowing', () => {
  it('counts only the speaker-ticket category', () => {
    const emails = redeemedFrom([
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
    const emails = redeemedFrom([ticket('  Claimed@X.Test ', 'Speaker ticket')])
    expect([...emails]).toEqual(['claimed@x.test'])
  })

  it('does not throw on a null or blank contact email, and never matches one', () => {
    const emails = redeemedFrom([
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
        sendTicketInvitation: vi.fn(),
        fetchPublicTicketTypes: vi.fn().mockResolvedValue({
          event: {},
          tickets: [
            { id: 9, name: 'Speaker ticket', requiresInvitation: true },
          ],
        }),
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
    const { fetchEventTickets } = provider({
      types: [{ id: 9, name: 'Speaker ticket', requiresInvitation: true }],
      tickets: [ticket('claimed@x.test', 'Speaker ticket')],
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
      provider: {
        fetchEventTickets,
        sendTicketInvitation: vi.fn(),
        fetchPublicTicketTypes: vi.fn().mockResolvedValue({
          event: {},
          tickets: [
            { id: 9, name: 'Speaker ticket', requiresInvitation: true },
          ],
        }),
      },
      eventRef: { customerId: 42, eventId: 7 },
    })

    expect(await fetchRedeemedSpeakerEmails(CONF)).toBeNull()
    expect([...(await fetchRedeemedSpeakerEmails(CONF))!]).toEqual([
      'claimed@x.test',
    ])
  })
})

describe('toTicketCandidates / searchTicketCandidates — the organizer search', () => {
  const raw = [
    {
      id: 1,
      order_id: 500,
      sum: '1990',
      category: 'Speaker ticket',
      customer_name: 'Acme AS',
      crm: {
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'Ada@Work.Example',
      },
      order: { paid: true, paymentStatus: 'paid', createdAt: '' },
    },
    {
      id: 2,
      order_id: 501,
      sum: '0',
      category: 'Conference (1 day)',
      customer_name: null,
      crm: { first_name: '', last_name: '', email: 'grace@navy.example' },
    },
    // No contact address: cannot be matched and cannot be linked.
    {
      id: 3,
      order_id: 502,
      sum: '0',
      category: 'Conference (1 day)',
      crm: { email: null },
    },
  ] as unknown as EventTicket[]

  it('keeps the ticket id, name, address and category — and DROPS order ids, sums and payment state', () => {
    const [first] = toTicketCandidates(raw)
    expect(first).toEqual({
      ticketId: 1,
      name: 'Ada Lovelace',
      email: 'ada@work.example',
      registeredEmail: 'Ada@Work.Example',
      category: 'Speaker ticket',
    })
    // The narrowing is the PII control: the order id, the sum and the payment
    // state must not survive the fetch.
    expect(Object.keys(first).sort()).toEqual([
      'category',
      'email',
      'name',
      'registeredEmail',
      'ticketId',
    ])
  })

  it('drops a ticket with no contact address', () => {
    expect(toTicketCandidates(raw).map((c) => c.email)).toEqual([
      'ada@work.example',
      'grace@navy.example',
    ])
  })

  it('matches on name or address, case-insensitively', () => {
    const candidates = toTicketCandidates(raw)
    expect(searchTicketCandidates(candidates, 'LOVELACE')).toHaveLength(1)
    expect(searchTicketCandidates(candidates, 'work.example')[0].email).toBe(
      'ada@work.example',
    )
    expect(searchTicketCandidates(candidates, 'nobody')).toEqual([])
  })

  it('returns nothing below two characters, and caps the result set', () => {
    expect(searchTicketCandidates(toTicketCandidates(raw), 'a')).toEqual([])
    const many = Array.from({ length: 50 }, (_, i) => ({
      ticketId: i,
      name: `Person ${i}`,
      email: `p${i}@example.test`,
      registeredEmail: `p${i}@example.test`,
      category: 'Conference (1 day)',
    }))
    expect(searchTicketCandidates(many, 'person')).toHaveLength(20)
  })
})
