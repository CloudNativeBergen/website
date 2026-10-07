/**
 * @vitest-environment node
 *
 * REACHABILITY of the attendee workshop portal (#689). The `(workshop)` segment
 * layout and the portal page both consult the workshop feature gate, so a
 * tenant without the feature gets a 404 — never a sign-in button that leads
 * into a WorkOS round-trip its own host can never complete.
 *
 * Only EXTERNAL boundaries are mocked — the Sanity documents (conference +
 * organization) and WorkOS AuthKit — so the real entitlement resolution and the
 * page's real component composition decide. `notFound()` is mocked to throw the
 * way Next.js does, which is how these assertions detect the 404.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGetConference = vi.fn()
const mockGetOrganizationById = vi.fn()
const mockWithAuth = vi.fn()

class NotFoundError extends Error {
  digest = 'NEXT_NOT_FOUND'
}

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFoundError('NEXT_NOT_FOUND')
  },
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    mockGetConference(...args),
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: (...args: unknown[]) => mockGetOrganizationById(...args),
  getOrganizationRefForCurrentConference: () => null,
}))

/**
 * The platform-org grant is an ID comparison against the configured
 * `PLATFORM_ORG_ID` (RunKonf/platform#43) — pure env, no Sanity read and never
 * the cached org document's `slug`. A case OPTS IN to being the platform org by
 * pointing `PLATFORM_ORG_ID` at the request org's id. This mock is a TRIPWIRE:
 * a reintroduced slug lookup would call it and trip the no-fetch guard.
 */
const h = vi.hoisted(() => ({ fetch: vi.fn(async () => null) }))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
}))

vi.mock('@workos-inc/authkit-nextjs', () => ({
  withAuth: (...args: unknown[]) => mockWithAuth(...args),
}))

// External boundary too: the AuthKit client provider cannot be imported under
// vitest (its ESM build resolves `next/cache` extensionless). Everything the
// app owns — the real Layout, WorkshopList and eligibility modules — is left
// alone so this exercises the page's actual composition.
vi.mock('@workos-inc/authkit-nextjs/components', () => ({
  AuthKitProvider: ({ children }: { children: React.ReactNode }) => children,
}))

/**
 * `resolveTicketingProvider` is the mocked boundary (#1294), so credential and
 * binding resolution do NOT run here. Everything above it is real: the ticket
 * memo, the eligibility rule and the access decision.
 */
const ticketing = vi.hoisted(() => ({
  fetchEventTickets: vi.fn(),
  resolve: vi.fn(),
}))

vi.mock('@/lib/tickets/provider', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/tickets/provider')>()),
  resolveTicketingProvider: ticketing.resolve,
}))

import { isValidElement, type ReactNode } from 'react'
import WorkshopLayout from '@/app/(workshop)/layout'
import WorkshopPage from '@/app/(workshop)/workshop/page'
import { __resetRedeemedCache } from '@/lib/tickets/speakerStatus'

const PLATFORM_SLUG = 'platform-org'

function conference(orgId: string | null) {
  return {
    _id: 'conf-1',
    title: 'CNDN',
    ...(orgId ? { organization: { _ref: orgId, _type: 'reference' } } : {}),
  }
}

/**
 * Every string in the element tree the page RETURNED, without rendering any
 * component — enough to tell which of the page's states it chose.
 */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children)
  }
  return ''
}

/** Did rendering this server component 404? */
async function is404(render: () => Promise<unknown>): Promise<boolean> {
  try {
    await render()
    return false
  } catch (error) {
    if (error instanceof NotFoundError) return true
    throw error
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetRedeemedCache()
  // A configured platform org that matches none of the tenants below, so a case
  // is platform ONLY when it points the contract at its own org id.
  vi.stubEnv('PLATFORM_ORG_ID', 'org-none')
  mockWithAuth.mockResolvedValue({ user: null })
  ticketing.fetchEventTickets.mockResolvedValue([
    {
      id: 1,
      order_id: 1,
      category: 'Workshop + Conference (2 days)',
      crm: { email: 'ada@example.com' },
    },
  ])
  ticketing.resolve.mockResolvedValue({
    configured: true,
    provider: { fetchEventTickets: ticketing.fetchEventTickets },
    eventRef: { customerId: 1, eventId: 2 },
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('workshop portal — feature OFF', () => {
  beforeEach(() => {
    mockGetConference.mockResolvedValue({
      conference: conference('org-tenant2'),
      error: null,
    })
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-tenant2',
      name: 'Tenant Two',
      slug: 'tenant-two',
      plan: 'enterprise',
    })
  })

  it('404s the whole segment from the layout', async () => {
    expect(await is404(() => WorkshopLayout({ children: null }))).toBe(true)
  })

  it('404s the portal page WITHOUT starting a WorkOS session round-trip', async () => {
    expect(await is404(() => WorkshopPage())).toBe(true)
    expect(mockWithAuth).not.toHaveBeenCalled()
  })
})

describe('workshop portal — unresolvable org fails CLOSED', () => {
  it('404s when the conference carries no organization', async () => {
    mockGetConference.mockResolvedValue({
      conference: conference(null),
      error: null,
    })

    expect(await is404(() => WorkshopPage())).toBe(true)
    expect(await is404(() => WorkshopLayout({ children: null }))).toBe(true)
    expect(mockGetOrganizationById).not.toHaveBeenCalled()
  })

  it('404s when the organization document is missing', async () => {
    mockGetConference.mockResolvedValue({
      conference: conference('org-ghost'),
      error: null,
    })
    mockGetOrganizationById.mockResolvedValue(null)

    expect(await is404(() => WorkshopPage())).toBe(true)
  })
})

describe('workshop portal — feature ON (platform org)', () => {
  beforeEach(() => {
    vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
    mockGetConference.mockResolvedValue({
      conference: conference('org-platform'),
      error: null,
    })
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-platform',
      name: 'Platform',
      slug: PLATFORM_SLUG,
    })
  })

  it('renders the segment layout', async () => {
    expect(await is404(() => WorkshopLayout({ children: null }))).toBe(false)
  })

  it('renders the portal page and authenticates the attendee as before', async () => {
    expect(await is404(() => WorkshopPage())).toBe(false)
    expect(mockWithAuth).toHaveBeenCalledOnce()
  })
})

/**
 * #1294. The page renders from the SAME access decision the attendee procedures
 * enforce (`decideWorkshopPortalAccess`), so it cannot show a signup form the
 * API would refuse. Each refusal is exercised with the other conditions
 * satisfied and asserted on its own text.
 */
describe('workshop portal — signed-in attendee', () => {
  const ADA = {
    id: 'workos-ada',
    email: 'ada@example.com',
    emailVerified: true,
    firstName: 'Ada',
    lastName: 'Lovelace',
  }

  beforeEach(() => {
    vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
    mockGetConference.mockResolvedValue({
      conference: conference('org-platform'),
      error: null,
    })
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-platform',
      name: 'Platform',
      slug: PLATFORM_SLUG,
    })
    mockWithAuth.mockResolvedValue({ user: ADA })
  })

  it('shows the signup page to a verified ticket holder', async () => {
    const text = textOf(await WorkshopPage())

    expect(text).toContain('Workshop Signup')
    expect(text).toContain('Ada Lovelace')
    expect(text).not.toContain('Workshop Access Required')
  })

  it('refuses an unverified email even when it matches a workshop ticket', async () => {
    mockWithAuth.mockResolvedValue({ user: { ...ADA, emailVerified: false } })

    const text = textOf(await WorkshopPage())

    expect(text).toContain('Workshop Access Required')
    expect(text).toContain('has not been verified')
    expect(ticketing.fetchEventTickets).not.toHaveBeenCalled()
  })

  it('refuses a verified attendee with no ticket', async () => {
    ticketing.fetchEventTickets.mockResolvedValue([])

    const text = textOf(await WorkshopPage())

    expect(text).toContain('Workshop Access Required')
    expect(text).toContain('No ticket found for your email address')
  })

  it('refuses, with a retry message, when the provider cannot answer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    ticketing.fetchEventTickets.mockRejectedValue(new Error('vendor down'))

    const text = textOf(await WorkshopPage())

    expect(text).toContain('Workshop Access Required')
    expect(text).toContain('Unable to verify workshop ticket at this time')
    expect(text).not.toContain('Welcome,')
  })

  it('refuses when the conference has no ticketing configured — no skipped check', async () => {
    // The page used to skip the ticket check entirely for a conference without
    // ticketing ids, and showed the signup form to anyone signed in.
    ticketing.resolve.mockResolvedValue({
      configured: false,
      provider: null,
      eventRef: null,
    })

    const text = textOf(await WorkshopPage())

    expect(text).toContain('Workshop Access Required')
    expect(text).toContain('Unable to verify workshop ticket')
    expect(text).not.toContain('Welcome,')
  })
})
