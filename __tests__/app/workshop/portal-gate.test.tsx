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

import WorkshopLayout from '@/app/(workshop)/layout'
import WorkshopPage from '@/app/(workshop)/workshop/page'

const PLATFORM_SLUG = 'platform-org'

function conference(orgId: string | null) {
  return {
    _id: 'conf-1',
    title: 'CNDN',
    ...(orgId ? { organization: { _ref: orgId, _type: 'reference' } } : {}),
  }
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
  // A configured platform org that matches none of the tenants below, so a case
  // is platform ONLY when it points the contract at its own org id.
  vi.stubEnv('PLATFORM_ORG_ID', 'org-none')
  mockWithAuth.mockResolvedValue({ user: null })
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
