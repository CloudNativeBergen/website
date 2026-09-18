/**
 * @vitest-environment node
 *
 * THE DRIFT TEST (#1098).
 *
 * Two things decide who gets into a workshop: the `/workshop` gate
 * (`checkWorkshopEligibility`) and the ticket-sold webhook that emails the
 * sign-in instructions. Each used to carry its own verbatim copy of
 * `WORKSHOP_ELIGIBLE_CATEGORIES` — a hardcoded, case-sensitive list of one
 * conference's Checkin type names — so a rename in the vendor UI broke them
 * INDEPENDENTLY and silently: the door said "upgrade your ticket" to a paying
 * attendee while the mail simply stopped going out.
 *
 * So every case below drives BOTH from ONE fixture and asserts they agree. A
 * future edit that changes one path's rule without the other fails here.
 */
import { NextRequest } from 'next/server'
import crypto from 'crypto'

const mockSendWorkshop = vi.fn()
const mockGetConference = vi.fn()
const mockGetTenant = vi.fn()
const mockGetOrganizationById = vi.fn()
const mockResolveTicketingProvider = vi.fn()

vi.mock('@/lib/email/workshop', () => ({
  sendWorkshopSignupInstructions: (...args: unknown[]) =>
    mockSendWorkshop(...args),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceByCheckinEventId: (...args: unknown[]) =>
    mockGetConference(...args),
  getConferenceTenantByCheckinEventId: (...args: unknown[]) =>
    mockGetTenant(...args),
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: (...args: unknown[]) => mockGetOrganizationById(...args),
  getOrganizationRefForCurrentConference: () => null,
}))

// ONLY the gate's ticket fetch is faked. The webhook's own imports from this
// module (signature verification, credential resolution) stay REAL, so the
// delivery below is authenticated exactly as in production.
vi.mock('@/lib/tickets/provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tickets/provider')>()),
  resolveTicketingProvider: (...args: unknown[]) =>
    mockResolveTicketingProvider(...args),
}))

const h = vi.hoisted(() => ({ fetch: vi.fn(async () => null) }))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
}))

import { checkWorkshopEligibility } from '@/lib/workshop/eligibility'
import type { EventTicket } from '@/lib/tickets/types'

const SECRET = 'checkin-webhook-test-secret'
const EVENT_ID = 42
const ATTENDEE = 'ada@example.com'

/** The historical hardcoded name. */
const LEGACY = 'Workshop + Conference (2 days)'
/** This tenant's own name for the same thing — in no literal anywhere. */
const DECLARED = 'Workshopdag 2026'
const ORDINARY = 'Conference only'

type Role = { typeName: string; admits: boolean; grantsWorkshop?: boolean }

function sign(data: unknown, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(data))
    .digest('hex')
}

/** Does the WEBHOOK mail this ticket type at a conference with these roles? */
async function webhookMails(
  category: string,
  ticketTypeRoles?: Role[],
): Promise<boolean> {
  const { POST } = await import('@/app/api/webhooks/checkin/ticket-sold/route')

  // Each fixture is judged on ITS OWN delivery: several run per test case.
  mockSendWorkshop.mockClear()

  const conference = {
    _id: 'conf-1',
    title: 'Fixture Conf',
    organization: { _ref: 'org-platform', _type: 'reference' },
    ...(ticketTypeRoles ? { ticketTypeRoles } : {}),
  }
  mockGetTenant.mockResolvedValue({
    tenant: {
      _id: conference._id,
      organization: conference.organization,
      ticketingProvider: null,
    },
    error: null,
  })
  mockGetConference.mockResolvedValue({ conference, error: null })
  mockSendWorkshop.mockResolvedValue({ data: { emailId: 'em-1' }, error: null })

  const data = {
    id: 1,
    eventId: EVENT_ID,
    users: [
      {
        id: 1,
        crm: {
          id: 2,
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: { email: ATTENDEE },
        },
        ticket: { id: 3, name: category, type: 'attendee' },
        isPaid: true,
      },
    ],
    orderContact: {
      crm: {
        id: 9,
        firstName: 'Order',
        lastName: 'Contact',
        email: { email: 'order@example.com' },
      },
    },
  }
  const payload = {
    payloadId: 'p-1',
    event: 'event-order-created',
    dataType: 'order',
    data,
  }

  const response = await POST(
    new NextRequest('http://localhost:3000/api/webhooks/checkin/ticket-sold', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'checkin-signature': sign(data, SECRET),
      },
      body: JSON.stringify(payload),
    }),
  )

  expect(response.status).toBe(200)
  return mockSendWorkshop.mock.calls.length > 0
}

/** Does the `/workshop` GATE admit the same holder at the same conference? */
async function gateAdmits(
  category: string,
  ticketTypeRoles?: Role[],
): Promise<boolean> {
  mockResolveTicketingProvider.mockResolvedValue({
    configured: true,
    provider: {
      fetchEventTickets: vi
        .fn()
        .mockResolvedValue([
          { category, crm: { email: ATTENDEE } } as unknown as EventTicket,
        ]),
    },
    eventRef: { customerId: 1, eventId: EVENT_ID },
  })

  const result = await checkWorkshopEligibility({
    userEmail: ATTENDEE,
    conference: {
      checkinCustomerId: 1,
      checkinEventId: EVENT_ID,
      organization: { _ref: 'org-platform' },
      ticketTypeRoles,
    },
    contactEmail: 'help@example.com',
  })
  return result.isEligible
}

/** Both paths, one fixture, one answer. */
async function bothAgree(category: string, roles?: Role[]) {
  const mailed = await webhookMails(category, roles)
  const admitted = await gateAdmits(category, roles)
  expect(mailed).toBe(admitted)
  return admitted
}

describe('workshop access — the gate and the webhook cannot drift', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterAll(() => vi.restoreAllMocks())

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CHECKIN_WEBHOOK_SECRET = SECRET
    vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-platform',
      name: 'Platform',
      slug: 'platform-org',
    })
  })

  afterEach(() => {
    delete process.env.CHECKIN_WEBHOOK_SECRET
    vi.unstubAllEnvs()
  })

  it('BRIDGE: an undeclared conference grants on the legacy list, both paths', async () => {
    expect(await bothAgree(LEGACY)).toBe(true)
    expect(await bothAgree(ORDINARY)).toBe(false)
  })

  it('DECLARED: both paths follow the tenant’s own type name', async () => {
    const roles: Role[] = [
      { typeName: DECLARED, admits: true, grantsWorkshop: true },
      { typeName: ORDINARY, admits: true, grantsWorkshop: false },
    ]

    expect(await bothAgree(DECLARED, roles)).toBe(true)
    expect(await bothAgree(ORDINARY, roles)).toBe(false)
    // The rename: the legacy literal no longer grants at a configured
    // conference — on EITHER path, or the fix would be decorative on one.
    expect(await bothAgree(LEGACY, roles)).toBe(false)
  })
})
