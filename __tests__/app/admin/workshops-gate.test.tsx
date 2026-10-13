/**
 * @vitest-environment node
 *
 * The ORGANIZER-side workshop surface (#689). Hiding the sidebar entry is
 * presentation (see src/lib/admin/registry.test.ts) and the tRPC procedures are
 * gated separately (src/server/routers/workshop.feature.test.ts); this asserts
 * the page itself refuses to render for a tenant without the workshop feature,
 * and that it still loads normally for the platform org. Only the Sanity
 * boundary is mocked — the page's real component composition renders.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  stubOwnTicketingSecret,
  stubPlatformTicketingAccount,
} from '../../helpers/ticketingSecrets'

const mockGetConference = vi.fn()
const mockGetOrganizationById = vi.fn()
const mockGetWorkshops = vi.fn()
const mockGetAuthSession = vi.fn()

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
  // The org this request is for, as the page's own organizer check resolves
  // it. (The feature gate reads the org off the conference, not from here.)
  getOrganizationRefForCurrentConference: () => 'org-A',
}))

// The session is the mocked boundary; the page's guard (`denyNonOrganizer`)
// and the organizer rule behind it run for real.
vi.mock('@/lib/auth', () => ({
  getAuthSession: (...args: unknown[]) => mockGetAuthSession(...args),
}))

vi.mock('@/lib/workshop/sanity', () => ({
  getWorkshopsByConference: (...args: unknown[]) => mockGetWorkshops(...args),
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

/** The sign-in decision (`sign-in.test.ts`) — the page only forwards it. */
const mockWorkshopPortalUrl = vi.fn<() => Promise<string | null>>()
vi.mock('@/lib/workshop/sign-in', async (importOriginal) => ({
  // `workshopMainHost` is pure and runs for real.
  workshopMainHost: (
    await importOriginal<typeof import('@/lib/workshop/sign-in')>()
  ).workshopMainHost,
  workshopPortalUrl: () => mockWorkshopPortalUrl(),
}))

import WorkshopAdminPage from '@/app/(admin)/admin/workshops/page'

const PLATFORM_SLUG = 'platform-org'
/** A configured platform org distinct from the request org (`org-A`), so the
 * request org is NOT platform until a test points the contract at it. */
const OTHER_PLATFORM_ORG_ID = 'org-platform'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_ID', OTHER_PLATFORM_ORG_ID)
  stubPlatformTicketingAccount()
  mockGetWorkshops.mockResolvedValue([])
  // Every case is an organizer of this request's org unless it says otherwise.
  mockGetAuthSession.mockResolvedValue({
    speaker: { _id: 'organizer-1', organizerOrgIds: ['org-A'] },
  })
  mockWorkshopPortalUrl.mockResolvedValue(null)
  mockGetConference.mockResolvedValue({
    conference: {
      _id: 'conf-1',
      organization: { _ref: 'org-A', _type: 'reference' },
    },
    error: null,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('/admin/workshops — feature gate', () => {
  it('404s for a paid tenant whose ticketing has no credentials (#1295)', async () => {
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-A',
      name: 'Tenant A',
      slug: 'tenant-a',
      plan: 'enterprise',
    })

    await expect(WorkshopAdminPage()).rejects.toBeInstanceOf(NotFoundError)
    expect(mockGetWorkshops).not.toHaveBeenCalled()
  })

  it('404s when the organization cannot be resolved (fail closed)', async () => {
    mockGetConference.mockResolvedValue({
      conference: { _id: 'conf-1' },
      error: null,
    })

    await expect(WorkshopAdminPage()).rejects.toBeInstanceOf(NotFoundError)
    expect(mockGetOrganizationById).not.toHaveBeenCalled()
  })

  it('renders for a pro tenant with its own ticketing credentials (#1295)', async () => {
    stubOwnTicketingSecret('org-A')
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-A',
      name: 'Tenant A',
      slug: 'tenant-a',
      plan: 'pro',
    })

    await expect(WorkshopAdminPage()).resolves.toBeTruthy()
    expect(mockGetWorkshops).toHaveBeenCalledWith('conf-1')
  })

  it('renders for the platform org on the pro plan — production’s configuration', async () => {
    vi.stubEnv('PLATFORM_ORG_ID', 'org-A')
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-A',
      name: 'Platform',
      slug: PLATFORM_SLUG,
      plan: 'pro',
    })

    await expect(WorkshopAdminPage()).resolves.toBeTruthy()
    expect(mockGetWorkshops).toHaveBeenCalledWith('conf-1')
    expect(h.fetch).not.toHaveBeenCalled()
  })
})

describe('/admin/workshops — resend sign-up instructions (#1298)', () => {
  beforeEach(() => {
    stubOwnTicketingSecret('org-A')
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-A',
      name: 'Tenant A',
      slug: 'tenant-a',
      plan: 'pro',
    })
  })

  async function resendDisabledReason() {
    const page = (await WorkshopAdminPage()) as {
      props: { resendDisabledReason: string | null }
    }
    return page.props.resendDisabledReason
  }

  it('offers the resend once the portal link works and registration is open', async () => {
    mockWorkshopPortalUrl.mockResolvedValue('https://2026.example.org/workshop')
    await expect(resendDisabledReason()).resolves.toBeNull()
  })

  it('names the main host while its portal link does not work', async () => {
    mockWorkshopPortalUrl.mockResolvedValue(null)
    mockGetConference.mockResolvedValue({
      conference: {
        _id: 'conf-1',
        organization: { _ref: 'org-A', _type: 'reference' },
        domains: ['2026.example.org', 'conf.konf.app'],
      },
      error: null,
    })
    await expect(resendDisabledReason()).resolves.toBe(
      'Available once attendees can sign in on 2026.example.org, the conference’s first domain.',
    )
  })

  it('says the conference needs a domain when it has none', async () => {
    mockWorkshopPortalUrl.mockResolvedValue(null)
    await expect(resendDisabledReason()).resolves.toBe(
      'Available once the conference has a domain attendees can sign in on.',
    )
  })

  it('says why once registration has closed', async () => {
    mockWorkshopPortalUrl.mockResolvedValue('https://2026.example.org/workshop')
    mockGetConference.mockResolvedValue({
      conference: {
        _id: 'conf-1',
        organization: { _ref: 'org-A', _type: 'reference' },
        workshopRegistrationEnd: new Date(Date.now() - 60_000).toISOString(),
      },
      error: null,
    })
    await expect(resendDisabledReason()).resolves.toMatch(/has closed/)
  })

  // Fixing the host would not bring the resend back, so the reason must not
  // say it would — and the closed check needs no sign-in lookup.
  it('says registration has closed even when the main host cannot sign in', async () => {
    mockWorkshopPortalUrl.mockResolvedValue(null)
    mockGetConference.mockResolvedValue({
      conference: {
        _id: 'conf-1',
        organization: { _ref: 'org-A', _type: 'reference' },
        domains: ['2026.example.org'],
        workshopRegistrationEnd: new Date(Date.now() - 60_000).toISOString(),
      },
      error: null,
    })
    await expect(resendDisabledReason()).resolves.toBe(
      'Workshop registration has closed.',
    )
    expect(mockWorkshopPortalUrl).not.toHaveBeenCalled()
  })
})

/**
 * THE CARD IS READ LIVE (#1345, review round 2). The registration card is the
 * baseline of every save: the form sends only what differs from it. The
 * cached conference read can serve the times from before a save for a while
 * (`revalidateTag(tag, 'default')` serves stale content to the next request),
 * so an organizer who set a time back to what the stale card showed would send
 * nothing. This page therefore asks for the read that skips both cache layers.
 */
describe('/admin/workshops — the registration times are read live', () => {
  const STALE = {
    workshopRegistrationSponsorStart: '2026-05-02T06:00:00.000Z',
    workshopRegistrationStart: '2026-05-10T06:00:00.000Z',
    workshopRegistrationEnd: '2026-05-20T06:00:00.000Z',
  }
  const STORED = {
    workshopRegistrationSponsorStart: '2026-06-01T06:00:00.000Z',
    workshopRegistrationStart: '2026-06-15T06:30:00.000Z',
    workshopRegistrationEnd: '2026-07-01T07:00:00.000Z',
  }

  beforeEach(() => {
    stubOwnTicketingSecret('org-A')
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-A',
      name: 'Tenant A',
      slug: 'tenant-a',
      plan: 'pro',
    })
    // The cached read still has the times from before the last save; only
    // the read that skips the caches has what is stored.
    mockGetConference.mockImplementation(
      async (options?: { uncached?: boolean }) => ({
        conference: {
          _id: 'conf-1',
          organization: { _ref: 'org-A', _type: 'reference' },
          ...(options?.uncached ? STORED : STALE),
        },
        error: null,
      }),
    )
  })

  it('hands the card the stored times, from one read that skips the caches', async () => {
    const page = (await WorkshopAdminPage()) as React.ReactElement<
      Record<string, unknown>
    >

    expect(page.props).toMatchObject(STORED)
    expect(mockGetConference.mock.calls).toEqual([[{ uncached: true }]])
  })
})

/**
 * THE PAGE REFUSES FOR ITSELF, BEFORE IT READS (#1345, review round 3).
 *
 * `src/proxy.ts` lets any signed-in session reach /admin, and the admin
 * layout's organizer check does not stop a page from running (Next's own
 * authentication guide: "a layout that hides or swaps them does not stop them
 * from running or from appearing in the RSC Payload"). This page now makes a
 * live conference read on every view, so the guard comes first: a request
 * from someone who is not an organizer of this org causes no read at all.
 */
describe('/admin/workshops — refuses a non-organizer before any read', () => {
  beforeEach(() => {
    stubOwnTicketingSecret('org-A')
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-A',
      name: 'Tenant A',
      slug: 'tenant-a',
      plan: 'pro',
    })
  })

  /** Every string in the element tree the page returned. */
  function textOf(node: React.ReactNode): string {
    if (typeof node === 'string') return node
    if (Array.isArray(node)) return node.map(textOf).join('')
    if (node && typeof node === 'object' && 'props' in node) {
      return textOf(
        (node as React.ReactElement<{ children?: React.ReactNode }>).props
          .children,
      )
    }
    return ''
  }

  /** What one view of the page did, as a value. */
  async function view() {
    const page = await WorkshopAdminPage()
    return {
      shown:
        textOf(page) === 'Access Denied' ? 'Access Denied' : 'the workshops',
      conferenceReads: mockGetConference.mock.calls,
      workshopReads: mockGetWorkshops.mock.calls,
      liveReads: h.fetch.mock.calls,
    }
  }

  const DENIED_WITHOUT_A_READ = {
    shown: 'Access Denied',
    conferenceReads: [],
    workshopReads: [],
    liveReads: [],
  }

  it('a signed-in speaker who organizes nothing', async () => {
    mockGetAuthSession.mockResolvedValue({
      speaker: { _id: 'speaker-9', organizerOrgIds: [] },
    })
    expect(await view()).toEqual(DENIED_WITHOUT_A_READ)
  })

  it('an organizer of another org', async () => {
    mockGetAuthSession.mockResolvedValue({
      speaker: { _id: 'organizer-2', organizerOrgIds: ['org-B'] },
    })
    expect(await view()).toEqual(DENIED_WITHOUT_A_READ)
  })

  it('nobody signed in', async () => {
    mockGetAuthSession.mockResolvedValue(null)
    expect(await view()).toEqual(DENIED_WITHOUT_A_READ)
  })

  it('CONTROL: an organizer of this org gets the page, from its reads', async () => {
    expect(await view()).toMatchObject({
      shown: 'the workshops',
      conferenceReads: [[{ uncached: true }]],
      workshopReads: [['conf-1']],
    })
  })
})
