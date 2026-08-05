/**
 * @vitest-environment node
 *
 * WHAT AN ORGANIZER SEES on the five provider-backed ticket pages.
 *
 * All five used to render a red `ErrorDisplay "Checkin.no Configuration Error"`
 * whenever the Checkin binding was absent — an error frame for "not set up
 * yet", with no link to settings, hardcoded to one vendor so a Tito-bound
 * conference could never open any of them. Two of them lied on top of that:
 * orders claimed "No tickets have been sold" and ticket types rendered silently
 * empty for an org that simply had no credentials.
 *
 * These assertions pin the replacement: empty ≠ error ≠ unavailable, per page,
 * per state. Everything the app owns runs for real (the resolver, the feature
 * gate, the pages' own composition); only Sanity and the provider HTTP clients
 * are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mockGetConference = vi.fn()
const mockGetOrganizationById = vi.fn()

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    mockGetConference(...args),
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: (...args: unknown[]) => mockGetOrganizationById(...args),
  getOrganizationRefForCurrentConference: () => null,
}))

const h = vi.hoisted(() => ({
  fetch: vi.fn(async () => null),
  fetchEventTickets: vi.fn(),
  fetchPublicTicketTypes: vi.fn(),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientRead: { fetch: h.fetch },
  clientReadUncached: { fetch: h.fetch },
  clientWrite: { fetch: h.fetch },
}))

/**
 * The provider HTTP clients are the ONLY thing stubbed inside the ticketing
 * stack — `resolveTicketingProvider` still picks which one to construct, which
 * is what proves the Tito routing.
 */
vi.mock('@/lib/tickets/provider/checkin', () => ({
  CheckinProvider: class {
    readonly name = 'Checkin.no'
    isConfigured() {
      return true
    }
    fetchEventTickets = h.fetchEventTickets
    fetchPublicTicketTypes = h.fetchPublicTicketTypes
  },
}))

vi.mock('@/lib/tickets/provider/tito', () => ({
  TitoProvider: class {
    readonly name = 'Tito'
    isConfigured() {
      return true
    }
    fetchEventTickets = h.fetchEventTickets
    fetchPublicTicketTypes = h.fetchPublicTicketTypes
  },
}))

/**
 * Two CLIENT components in the ready path need a live tRPC provider and app
 * router, which a static server render has neither of. They are stubbed as
 * markers so the ready paths still assert "the page opened and rendered its
 * real body" — everything under test (the state resolution and the vendor
 * routing) happens before these render.
 */
vi.mock('@/components/admin/TicketAnalysisClient', () => ({
  TicketAnalysisClient: () => <div>ticket analysis</div>,
}))

vi.mock('@/components/admin/DiscountCodeManager', () => ({
  DiscountCodeManager: () => <div>discount manager</div>,
}))

vi.mock('@/lib/speaker/sanity', () => ({
  getSpeakers: vi.fn(async () => ({ speakers: [], err: null })),
  getOrganizerCount: vi.fn(async () => ({ count: 0, err: null })),
  getOrganizers: vi.fn(async () => ({ speakers: [], err: null })),
}))

import AdminTickets from '@/app/(admin)/admin/tickets/page'
import OrdersAdminPage from '@/app/(admin)/admin/tickets/orders/page'
import TicketTypesAdminPage from '@/app/(admin)/admin/tickets/types/page'
import DiscountCodesAdminPage from '@/app/(admin)/admin/tickets/discount/page'
import CompaniesAdminPage from '@/app/(admin)/admin/tickets/companies/page'

const PLATFORM_ORG_ID = 'org-platform'
const TENANT_ORG_ID = 'org-A'

type Binding = Record<string, unknown>

function stubConference(orgId: string | null, binding: Binding = {}) {
  mockGetConference.mockResolvedValue({
    conference: {
      _id: 'conf-1',
      title: 'Tenant Conf',
      city: 'Bergen',
      country: 'Norway',
      startDate: '2026-10-01',
      domains: ['tenant.example'],
      sponsors: [],
      ...(orgId ? { organization: { _ref: orgId, _type: 'reference' } } : {}),
      ...binding,
    },
    domain: 'tenant.example',
    error: null,
  })
}

const CHECKIN_BINDING = { checkinCustomerId: 42, checkinEventId: 4242 }
const TITO_BINDING = {
  ticketingProvider: 'tito',
  titoAccountSlug: 'cndn',
  titoEventSlug: '2026',
}

/** Render a server page component to HTML. */
async function html(page: () => Promise<React.ReactNode>): Promise<string> {
  return renderToStaticMarkup((await page()) as React.ReactElement)
}

const PAGES: [string, () => Promise<React.ReactNode>][] = [
  ['/admin/tickets', AdminTickets],
  ['/admin/tickets/orders', OrdersAdminPage],
  ['/admin/tickets/types', TicketTypesAdminPage],
  ['/admin/tickets/discount', DiscountCodesAdminPage],
  ['/admin/tickets/companies', CompaniesAdminPage],
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG_ID)
  vi.stubEnv('TENANT_SECRETS_JSON', '')
  vi.stubEnv('CHECKIN_API_KEY', 'platform-checkin-key')
  vi.stubEnv('CHECKIN_API_SECRET', 'platform-checkin-secret')
  vi.stubEnv('TITO_API_KEY', 'platform-tito-key')
  h.fetchEventTickets.mockResolvedValue([])
  h.fetchPublicTicketTypes.mockResolvedValue({
    event: { id: 1, name: 'Event', currencies: ['NOK'] },
    tickets: [],
  })
  mockGetOrganizationById.mockResolvedValue({
    _id: TENANT_ORG_ID,
    name: 'Tenant A',
    slug: 'tenant-a',
    plan: 'community',
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

/**
 * THE DAY-ONE TENANT. Nothing configured, no entitlement: every page says so
 * once, plainly, and none of them shows an error frame or a fabricated fact.
 */
describe('a non-entitled organization', () => {
  beforeEach(() => stubConference(TENANT_ORG_ID))

  for (const [route, page] of PAGES) {
    it(`${route} shows the unavailable state, not an error wall`, async () => {
      const markup = await html(page)

      expect(markup).toContain(
        'Ticketing is not available for your organization',
      )
      expect(markup).not.toContain('Configuration Error')
      expect(markup).not.toContain('Missing required')
      // No dead end to a settings form that cannot help.
      expect(markup).not.toContain('Open ticket settings')
      // Never our internal vocabulary.
      expect(markup).not.toContain('RunKonf/platform')
    })
  }

  it('/admin/tickets/orders does not claim zero sales', async () => {
    const markup = await html(OrdersAdminPage)
    expect(markup).not.toContain('No tickets have been sold')
    expect(markup).not.toContain('No orders found')
  })

  it('/admin/tickets/types does not render a silently empty list', async () => {
    const markup = await html(TicketTypesAdminPage)
    expect(markup).not.toContain('No ticket types found')
  })

  it('never calls the provider for an unentitled org', async () => {
    for (const [, page] of PAGES) await html(page)
    expect(h.fetchEventTickets).not.toHaveBeenCalled()
    expect(h.fetchPublicTicketTypes).not.toHaveBeenCalled()
  })

  /**
   * #820: filling the ids in is not enough without credentials. That used to
   * reach the fetch and surface a raw "Missing checkin configuration".
   */
  it('still says unavailable when the ids are filled in but no credentials exist', async () => {
    stubConference(TENANT_ORG_ID, CHECKIN_BINDING)
    const markup = await html(AdminTickets)
    expect(markup).toContain('Ticketing is not available for your organization')
    expect(markup).not.toContain('Missing checkin configuration')
  })
})

/** Entitled but not bound yet — actionable, and NOT an error. */
describe('an entitled organization with no event binding', () => {
  beforeEach(() => {
    stubConference(PLATFORM_ORG_ID)
    mockGetOrganizationById.mockResolvedValue({
      _id: PLATFORM_ORG_ID,
      name: 'Platform',
      slug: 'platform-org',
    })
  })

  for (const [route, page] of PAGES) {
    it(`${route} offers the ticket settings instead of an error`, async () => {
      const markup = await html(page)
      expect(markup).toContain('Ticketing is not connected yet')
      expect(markup).toContain('/admin/settings#tickets-registration')
      expect(markup).not.toContain('Configuration Error')
    })
  }
})

/** The platform org's own conference keeps working exactly as before. */
describe('the platform organization with a bound Checkin event', () => {
  beforeEach(() => {
    stubConference(PLATFORM_ORG_ID, CHECKIN_BINDING)
    mockGetOrganizationById.mockResolvedValue({
      _id: PLATFORM_ORG_ID,
      name: 'Platform',
      slug: 'platform-org',
    })
  })

  it('/admin/tickets/types lists the event’s ticket types', async () => {
    h.fetchPublicTicketTypes.mockResolvedValue({
      event: { id: 1, name: 'Event', currencies: ['NOK'] },
      tickets: [
        {
          id: 7,
          name: 'Early Bird',
          type: 'regular',
          description: null,
          price: [],
          available: 10,
          requiresInvitation: false,
          visibleStartsAt: null,
          visibleEndsAt: null,
          position: 1,
        },
      ],
    })

    const markup = await html(TicketTypesAdminPage)
    expect(markup).toContain('Early Bird')
    expect(markup).not.toContain('Ticketing is not')
  })

  it('/admin/tickets/orders reports a REAL zero-sales empty state', async () => {
    h.fetchEventTickets.mockResolvedValue([])
    const markup = await html(OrdersAdminPage)
    expect(markup).toContain('No orders found')
    expect(markup).toContain('No tickets have been sold for this event yet.')
    expect(markup).not.toContain('Ticketing is not')
  })

  it('/admin/tickets/discount renders the discount manager', async () => {
    const markup = await html(DiscountCodesAdminPage)
    expect(markup).not.toContain('Ticketing is not')
    expect(markup).not.toContain('does not support this')
  })
})

/**
 * THE TITO FIX. The Checkin-hardcoded guard meant a Tito-bound conference was
 * refused on every page for "missing Customer ID, Event ID" it does not use.
 */
describe('a Tito-bound conference', () => {
  beforeEach(() => {
    stubConference(PLATFORM_ORG_ID, TITO_BINDING)
    mockGetOrganizationById.mockResolvedValue({
      _id: PLATFORM_ORG_ID,
      name: 'Platform',
      slug: 'platform-org',
    })
  })

  it('/admin/tickets/types opens and names Tito as the source', async () => {
    h.fetchPublicTicketTypes.mockResolvedValue({
      event: { id: 1, name: 'Event', currencies: ['NOK'] },
      tickets: [
        {
          id: 7,
          name: 'Conference Pass',
          type: 'regular',
          description: null,
          price: [],
          available: null,
          requiresInvitation: false,
          visibleStartsAt: null,
          visibleEndsAt: null,
          position: 1,
        },
      ],
    })

    const markup = await html(TicketTypesAdminPage)
    expect(markup).toContain('Conference Pass')
    expect(markup).toContain('Tito')
    expect(markup).not.toContain('Customer ID')
    // The provider-shaped ref, not a bare Checkin event id.
    expect(h.fetchPublicTicketTypes).toHaveBeenCalledWith({
      provider: 'tito',
      accountSlug: 'cndn',
      eventSlug: '2026',
    })
  })

  it('/admin/tickets/orders opens and fetches through the Tito event ref', async () => {
    const markup = await html(OrdersAdminPage)
    expect(markup).not.toContain('Configuration Error')
    expect(h.fetchEventTickets).toHaveBeenCalledWith({
      provider: 'tito',
      accountSlug: 'cndn',
      eventSlug: '2026',
    })
  })

  it('/admin/tickets and /admin/tickets/companies open too', async () => {
    for (const page of [AdminTickets, CompaniesAdminPage]) {
      const markup = await html(page)
      expect(markup).not.toContain('Configuration Error')
      expect(markup).not.toContain('Ticketing is not')
    }
  })

  /**
   * Discount codes are a Checkin-only API on OUR side — say so, do not fail.
   * The copy must name the conference's OWN vendor: telling a Tito organizer to
   * go to Checkin.no sends them somewhere they have no account, and re-hardcodes
   * the vendor this PR exists to stop hardcoding.
   */
  it('/admin/tickets/discount names Tito, never sends the organizer to Checkin.no', async () => {
    const markup = await html(DiscountCodesAdminPage)
    expect(markup).toContain('Discount codes are not available for Tito')
    expect(markup).toContain('Tito dashboard')
    expect(markup).not.toContain('Checkin.no')
    expect(markup).not.toContain('Configuration Error')
  })
})
