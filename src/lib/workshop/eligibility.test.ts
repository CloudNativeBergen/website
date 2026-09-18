import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EventTicket } from '@/lib/tickets/types'

// B7: eligibility must route through the request-boundary resolver (so a
// tenant's per-org Checkin key is honored) instead of the platform env creds.
const resolveTicketingProviderMock = vi.fn()
vi.mock('@/lib/tickets/provider', () => ({
  resolveTicketingProvider: (...a: unknown[]) =>
    resolveTicketingProviderMock(...a),
}))
vi.mock('@/lib/email/from', () => ({
  platformFallbackContact: () => 'fallback@example.test',
}))

import { checkWorkshopEligibility, workshopAccessOf } from './eligibility'

/** The historical hardcoded name — the one the bridge still honours. */
const LEGACY = 'Workshop + Conference (2 days)'
/** A tenant's OWN name for its workshop type. In no literal list anywhere. */
const DECLARED = 'Workshop dag  '
const ORDINARY = 'Conference only'

function ticket(email: string, category: string): EventTicket {
  return {
    category,
    crm: { email },
  } as unknown as EventTicket
}

const CONF = {
  checkinCustomerId: 42,
  checkinEventId: 7,
  organization: { _ref: 'org-xyz' },
}

beforeEach(() => vi.clearAllMocks())

describe('checkWorkshopEligibility — resolver routing (B7)', () => {
  it('resolves the provider from the conference (per-org creds seam) and honors eligible tickets', async () => {
    const fetchEventTickets = vi
      .fn()
      .mockResolvedValue([ticket('SpeakeR@x.test', 'Speaker ticket')])
    resolveTicketingProviderMock.mockResolvedValue({
      configured: true,
      provider: { fetchEventTickets },
      eventRef: { customerId: 42, eventId: 7 },
    })

    const result = await checkWorkshopEligibility({
      userEmail: 'speaker@x.test',
      conference: CONF,
    })

    // The whole conference (with its org ref) is handed to the resolver.
    expect(resolveTicketingProviderMock).toHaveBeenCalledWith(CONF)
    // And the resolved eventRef — not raw params — drives the fetch.
    expect(fetchEventTickets).toHaveBeenCalledWith({
      customerId: 42,
      eventId: 7,
    })
    expect(result.isEligible).toBe(true)
    expect(result.eligibleTickets).toHaveLength(1)
  })

  it('soft-fails to “unable to verify” when the conference is unconfigured', async () => {
    resolveTicketingProviderMock.mockResolvedValue({
      configured: false,
      provider: null,
      eventRef: null,
    })

    const result = await checkWorkshopEligibility({
      userEmail: 'speaker@x.test',
      conference: {},
      contactEmail: 'help@x.test',
    })

    expect(result.isEligible).toBe(false)
    expect(result.reason).toContain('help@x.test')
    expect(result.tickets).toEqual([])
  })

  it('soft-fails (never throws) when the provider fetch errors', async () => {
    resolveTicketingProviderMock.mockResolvedValue({
      configured: true,
      provider: {
        fetchEventTickets: vi.fn().mockRejectedValue(new Error('checkin down')),
      },
      eventRef: { customerId: 42, eventId: 7 },
    })

    const result = await checkWorkshopEligibility({
      userEmail: 'speaker@x.test',
      conference: CONF,
    })

    expect(result.isEligible).toBe(false)
    expect(result.reason).toContain('Unable to verify')
  })
})

/**
 * THE ACCESS RULE ITSELF. `WORKSHOP_ELIGIBLE_CATEGORIES` used to live verbatim
 * in two files — here and in the ticket-sold webhook — as a hardcoded,
 * case-sensitive list of ONE conference's Checkin type names. A rename at the
 * vendor broke both independently and silently. These cases pin the three
 * things that replacement must keep true.
 */
describe('workshopAccessOf — the one rule', () => {
  it('BRIDGE: a conference that declares nothing behaves exactly as before', () => {
    // The regression that would lock every existing attendee out on deploy.
    expect(workshopAccessOf(LEGACY, undefined)).toBe('granted')
    expect(workshopAccessOf(LEGACY, [])).toBe('granted')
    expect(workshopAccessOf('Speaker ticket', [])).toBe('granted')
    expect(workshopAccessOf(ORDINARY, [])).toBe('denied')
    // `admits` declarations are NOT workshop declarations: a conference that
    // uses ticketTypeRoles only for counting is still on the bridge.
    expect(
      workshopAccessOf(LEGACY, [{ typeName: ORDINARY, admits: false }]),
    ).toBe('granted')
    // Nor is a lone `false` — only an explicit `true` configures a conference,
    // so a Studio default can never revoke access.
    expect(
      workshopAccessOf(LEGACY, [
        { typeName: ORDINARY, admits: true, grantsWorkshop: false },
      ]),
    ).toBe('granted')
  })

  it('A CONFIGURED CONFERENCE IS AUTHORITATIVE — no union with the literal', () => {
    const roles = [{ typeName: DECLARED, admits: true, grantsWorkshop: true }]

    expect(workshopAccessOf(DECLARED, roles)).toBe('granted')
    // The literal must NOT keep working here: if it did, a vendor-side rename
    // would silently keep granting through the old name and this whole change
    // would be decorative.
    expect(workshopAccessOf(LEGACY, roles)).toBe('unclassified')
    expect(
      workshopAccessOf(LEGACY, [
        ...roles,
        { typeName: LEGACY, admits: true, grantsWorkshop: false },
      ]),
    ).toBe('denied')
  })

  it('matches type names like classifyTicket does — case and whitespace', () => {
    const roles = [{ typeName: DECLARED, admits: true, grantsWorkshop: true }]

    expect(workshopAccessOf('  WORKSHOP DAG', roles)).toBe('granted')
    expect(workshopAccessOf('workshop dag', roles)).toBe('granted')
    // Never a substring test: `includes` would grant this one.
    expect(workshopAccessOf('Workshop dag companion', roles)).toBe(
      'unclassified',
    )
    expect(workshopAccessOf('', roles)).toBe('denied')
    expect(workshopAccessOf(null, roles)).toBe('denied')
  })
})

describe('checkWorkshopEligibility — what the attendee is told', () => {
  /** Run the gate for one holder of one ticket type at one conference. */
  async function gate(
    category: string,
    ticketTypeRoles?: {
      typeName: string
      admits: boolean
      grantsWorkshop?: boolean
    }[],
  ) {
    resolveTicketingProviderMock.mockResolvedValue({
      configured: true,
      provider: {
        fetchEventTickets: vi
          .fn()
          .mockResolvedValue([ticket('ada@x.test', category)]),
      },
      eventRef: { customerId: 42, eventId: 7 },
    })

    return checkWorkshopEligibility({
      userEmail: 'ada@x.test',
      conference: { ...CONF, ticketTypeRoles },
      contactEmail: 'help@x.test',
    })
  }

  const DECLARING = [
    { typeName: DECLARED, admits: true, grantsWorkshop: true },
    { typeName: ORDINARY, admits: true, grantsWorkshop: false },
  ]

  it('admits a holder of a DECLARED workshop type', async () => {
    const result = await gate(DECLARED, DECLARING)

    expect(result.isEligible).toBe(true)
    expect(result.eligibleTickets).toHaveLength(1)
  })

  it('denies a holder of a non-workshop ticket with the upgrade message', async () => {
    const result = await gate(ORDINARY, DECLARING)

    expect(result.isEligible).toBe(false)
    expect(result.reason).toContain('No valid workshop ticket found')
    // No configuration detail for someone who simply does not hold one.
    expect(result.reason).not.toContain('set up')
  })

  it('denies a RENAMED/unclassified type with the ORGANIZER-actionable message', async () => {
    // The vendor-side rename this whole change exists for: nobody has
    // classified "Workshop 2026", so telling its holder to upgrade is wrong.
    const result = await gate('Workshop 2026', DECLARING)

    expect(result.isEligible).toBe(false)
    expect(result.reason).toContain('Workshop 2026')
    expect(result.reason).toContain('an organizer')
    expect(result.reason).not.toContain('upgrade your ticket')
  })

  it('BRIDGE: an undeclared conference still admits the legacy type', async () => {
    await expect(gate(LEGACY)).resolves.toMatchObject({ isEligible: true })
    // ...and still tells its ordinary ticket holders to upgrade, never that
    // this conference is misconfigured.
    const denied = await gate(ORDINARY)
    expect(denied.reason).toContain('No valid workshop ticket found')
  })
})
