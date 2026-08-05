/**
 * @vitest-environment node
 *
 * THE BUDGET PAGE IS A TICKETING SURFACE TOO. It shows live ticket INCOME,
 * pulled straight from the conference's ticketing provider, so an operator's
 * explicit ticketing deny has to reach it: a kill switch that blanks
 * `/admin/tickets` while the budget page keeps printing live revenue is only
 * half a switch.
 *
 * Everything the app owns runs for real — the provider resolver, the credential
 * seam and the feature gate. Only Sanity, the provider HTTP client and the
 * budget page's own client component are supplied.
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
}))

vi.mock('@/lib/sanity/client', () => ({
  clientRead: { fetch: h.fetch },
  clientReadUncached: { fetch: h.fetch },
  clientWrite: { fetch: h.fetch },
}))

vi.mock('@/lib/tickets/provider/checkin', () => ({
  CheckinProvider: class {
    readonly name = 'Checkin.no'
    isConfigured() {
      return true
    }
    fetchEventTickets = h.fetchEventTickets
  },
}))

vi.mock('@/lib/budget', () => ({
  getBudgetForConference: vi.fn(async () => null),
  deriveTicketIncome: vi.fn(() => ({ gross: 1000, net: 800, count: 4 })),
  deriveManualTicketIncome: vi.fn(() => null),
  deriveSponsorIncome: vi.fn(() => ({ total: 0, deals: [] })),
}))

vi.mock('@/lib/sponsor-crm/sanity', () => ({
  listSponsorsForConference: vi.fn(async () => []),
}))

/** The client component is a marker: the gate decides before it renders. */
vi.mock('@/components/admin', () => ({
  BudgetPageClient: ({ ticketIncome }: { ticketIncome: unknown | null }) => (
    <div data-live-ticket-income={ticketIncome ? 'yes' : 'no'} />
  ),
  ErrorDisplay: ({ title }: { title: string }) => <div>{title}</div>,
}))

import AdminBudgetPage from '@/app/(admin)/admin/budget/page'

const PLATFORM_ORG_ID = 'org-platform'
const TENANT_ORG_ID = 'org-A'

function stubConference(orgId: string) {
  mockGetConference.mockResolvedValue({
    conference: {
      _id: 'conf-1',
      title: 'Tenant Conf',
      checkinCustomerId: 42,
      checkinEventId: 4242,
      organization: { _ref: orgId, _type: 'reference' },
    },
    error: null,
  })
}

/** Did the page hand live provider income to its client component? */
async function renderedLiveIncome(): Promise<string | null> {
  const markup = renderToStaticMarkup(
    (await AdminBudgetPage()) as React.ReactElement,
  )
  return markup.match(/data-live-ticket-income="([^"]*)"/)?.[1] ?? null
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_ID', PLATFORM_ORG_ID)
  vi.stubEnv('TENANT_SECRETS_JSON', '')
  vi.stubEnv('CHECKIN_API_KEY', 'platform-checkin-key')
  vi.stubEnv('CHECKIN_API_SECRET', 'platform-checkin-secret')
  h.fetchEventTickets.mockResolvedValue([])
  mockGetOrganizationById.mockResolvedValue({
    _id: TENANT_ORG_ID,
    name: 'Tenant A',
    slug: 'tenant-a',
    plan: 'pro',
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the budget page and the ticketing kill switch', () => {
  it('shows live ticket income for a bound, credentialed organization', async () => {
    stubConference(PLATFORM_ORG_ID)
    mockGetOrganizationById.mockResolvedValue({
      _id: PLATFORM_ORG_ID,
      name: 'Platform',
      slug: 'platform-org',
    })

    await expect(renderedLiveIncome()).resolves.toBe('yes')
    expect(h.fetchEventTickets).toHaveBeenCalled()
  })

  it('falls back to manual actuals — and never fetches — once an operator denies ticketing', async () => {
    stubConference(TENANT_ORG_ID)
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

    await expect(renderedLiveIncome()).resolves.toBe('no')
    expect(h.fetchEventTickets).not.toHaveBeenCalled()
  })

  /** The #828 guarantee here too: no decision + own credentials still works. */
  it('still shows live income for a credentialed tenant with no entitlement decision', async () => {
    stubConference(TENANT_ORG_ID)
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
      plan: 'community',
    })

    await expect(renderedLiveIncome()).resolves.toBe('yes')
    expect(h.fetchEventTickets).toHaveBeenCalled()
  })
})
