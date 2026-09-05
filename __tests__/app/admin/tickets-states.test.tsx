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

// The #860 opt-in island on the types page needs the same live tRPC provider.
// The marker carries the ticket id so the tests below can assert WHICH rows the
// page (the real `isPublicFreeTicketType` filtering) gave a toggle.
vi.mock('@/components/admin/PublicFreeTicketToggle', () => ({
  PublicFreeTicketToggle: ({ ticketId }: { ticketId: number }) => (
    <div>public-free-toggle-{ticketId}</div>
  ),
}))

// The discount page re-checks organizer standing itself (the sponsor invite
// link it reads is a bearer token), so these state assertions need a signed-in
// organizer to reach the states at all.
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn(async () => ({ speaker: { _id: 'organizer-1' } })),
}))

vi.mock('@/lib/authz/organizer', () => ({
  isOrganizerForCurrentOrg: vi.fn(async () => true),
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
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'

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

/**
 * THE KILL SWITCH ON THE PAGE ITSELF (owner decision, 2026-08-06). #828 hid the
 * nav entry on an explicit deny, but a deep link still rendered live sales for
 * an org whose own credentials resolved — the pages asked the provider first.
 * Every one of the five pages must now blank on a deny, and say something true:
 * this org HAS a working integration, so "not available for your organization"
 * would be a lie.
 */
describe('an organization an operator has explicitly DENIED', () => {
  beforeEach(() => {
    stubConference(TENANT_ORG_ID, CHECKIN_BINDING)
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({
        [TENANT_ORG_ID]: { ticketing: { apiKey: 'tenant-key' } },
      }),
    )
    mockGetOrganizationById.mockResolvedValue({
      _id: TENANT_ORG_ID,
      name: 'Tenant A',
      slug: 'tenant-a',
      plan: 'pro',
      featureOverrides: [{ feature: 'ticketing', enabled: false }],
    })
  })

  for (const [route, page] of PAGES) {
    it(`${route} is blocked by the deny, credentials and all`, async () => {
      const markup = await html(page)

      expect(markup).toContain(
        'Ticketing has been turned off for your organization',
      )
      // NOT the never-had-it copy: this org had a working integration.
      expect(markup).not.toContain(
        'Ticketing is not available for your organization',
      )
      expect(markup).not.toContain('Configuration Error')
      // Nothing to fix in settings, so no dead-end link.
      expect(markup).not.toContain('Open ticket settings')
    })
  }

  it('never calls the provider for a denied org', async () => {
    for (const [, page] of PAGES) await html(page)
    expect(h.fetchEventTickets).not.toHaveBeenCalled()
    expect(h.fetchPublicTicketTypes).not.toHaveBeenCalled()
  })

  it('/admin/tickets/types renders no #860 opt-in toggle behind the deny notice', async () => {
    const markup = await html(TicketTypesAdminPage)
    expect(markup).not.toContain('public-free-toggle')
  })
})

/**
 * THE #828 GUARANTEE, PAGE-LEVEL: no decision either way + the org's own
 * credentials still opens the surface. Only an explicit deny closes it.
 */
describe('a credentialed organization with no entitlement decision', () => {
  beforeEach(() => {
    stubConference(TENANT_ORG_ID, CHECKIN_BINDING)
    vi.stubEnv(
      'TENANT_SECRETS_JSON',
      JSON.stringify({
        [TENANT_ORG_ID]: { ticketing: { apiKey: 'tenant-key' } },
      }),
    )
  })

  it('/admin/tickets/orders opens and fetches its real sales', async () => {
    const markup = await html(OrdersAdminPage)
    expect(markup).not.toContain('Ticketing is not')
    expect(markup).not.toContain('Ticketing has been turned off')
    expect(h.fetchEventTickets).toHaveBeenCalled()
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

  /**
   * THE #860 TOGGLE'S REACH: exactly the types the opt-in can publish — free
   * AND not invite-only, the same predicate `resolveDisplayTickets` filters
   * on. A toggle on a priced or invite-only row would promise a publish that
   * the public policy silently ignores.
   */
  it('/admin/tickets/types gives the opt-in toggle only to public free types', async () => {
    const base = {
      description: null,
      available: null,
      visibleStartsAt: null,
      visibleEndsAt: null,
    }
    h.fetchPublicTicketTypes.mockResolvedValue({
      event: { id: 1, name: 'Event', currencies: ['NOK'] },
      tickets: [
        {
          ...base,
          id: 7,
          name: 'Student',
          type: 'regular',
          price: [],
          requiresInvitation: false,
          position: 1,
        },
        {
          ...base,
          id: 8,
          name: 'Conference Pass',
          type: 'regular',
          price: [{ price: '4990', vat: 25, key: 'nok', description: '' }],
          requiresInvitation: false,
          position: 2,
        },
        {
          ...base,
          id: 9,
          name: 'Crew',
          type: 'regular',
          price: [],
          requiresInvitation: true,
          position: 3,
        },
      ],
    })

    const markup = await html(TicketTypesAdminPage)
    expect(markup).toContain('public-free-toggle-7')
    expect(markup).not.toContain('public-free-toggle-8')
    expect(markup).not.toContain('public-free-toggle-9')
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

/**
 * The mocks above hand every other case a signed-in organizer, which would
 * hide the page's own guard entirely. This is the case that proves it exists:
 * the sponsor invite link the page reads is a bearer token that buys hidden
 * tickets, and /admin only requires SOME session, so a speaker account must
 * not reach the page even though it reaches the admin layout.
 */
describe('a signed-in speaker who is not an organizer', () => {
  beforeEach(() => stubConference(TENANT_ORG_ID))

  it('/admin/tickets/discount is denied before the invite link is read', async () => {
    vi.mocked(isOrganizerForCurrentOrg).mockResolvedValueOnce(false)

    const markup = await html(DiscountCodesAdminPage)
    expect(markup).toContain('Access Denied')
    expect(markup).not.toContain('discount manager')
  })
})
