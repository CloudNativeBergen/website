/**
 * @vitest-environment node
 *
 * REACHABILITY of the attendee workshop portal (#689). The `(workshop)` segment
 * layout and the portal page both consult the workshop feature gate, so a
 * tenant without the feature gets a 404 — never a sign-in button that leads
 * into a WorkOS round-trip its own host can never complete.
 *
 * Only EXTERNAL boundaries are mocked — the Sanity documents (conference +
 * organization) and the live client every record read goes through — so the
 * real entitlement resolution, the real session read (#1314: the seal, the
 * destination policy) and the page's real component composition decide.
 * `notFound()` is mocked to throw the way Next.js does, which is how these
 * assertions detect the 404.
 *
 * A signed-in attendee is a session sealed here with the real seal, in the
 * cookie the page reads. That the redeem route issues exactly such a session is
 * proven in `redeem.test.ts`, and that a reader accepts the one it issued in
 * `trpc.workshopUser.test.ts`.
 */
import '../../helpers/workosEnv'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  beginRequest,
  presentCookie,
  writtenCookies,
} from '../../helpers/nextHeadersJar'
import { provenClaim } from '../../helpers/domainClaims'
import {
  stubOwnTicketingSecret,
  stubPlatformTicketingAccount,
} from '../../helpers/ticketingSecrets'

const mockGetConference = vi.fn()
const mockGetOrganizationById = vi.fn()

vi.mock('jose', async () => (await import('../../helpers/realJose')).realJose())

class NotFoundError extends Error {
  digest = 'NEXT_NOT_FOUND'
}

class RedirectError extends Error {
  digest = 'NEXT_REDIRECT'
  constructor(readonly url: string) {
    super('NEXT_REDIRECT')
  }
}

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFoundError('NEXT_NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new RedirectError(url)
  },
}))

vi.mock('next/headers', () => import('../../helpers/nextHeadersJar'))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    mockGetConference(...args),
  getConferenceForDomain: vi.fn(),
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
 * a reintroduced slug lookup would call it and trip the read counts below.
 *
 * It is also THE LIVE CLIENT: the host's record (`getDomainClaim`, the real
 * query) is read through it, from `claims`, and every read is counted.
 */
const h = vi.hoisted(() => ({
  fetch: vi.fn<(query: string, params?: { id?: string }) => Promise<unknown>>(),
  /** The records the live client knows, by id, as Sanity returns them. */
  claims: new Map<string, unknown>(),
}))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
}))

// Everything the app owns — the real Layout, WorkshopList and eligibility
// modules — is left alone so this exercises the page's actual composition.

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
import { signOutOfWorkshop } from '@/app/(workshop)/workshop/actions'
import { WorkshopSignedOut } from '@/components/workshop/WorkshopSignedOut'
import { WorkshopUnavailable } from '@/components/workshop/WorkshopUnavailable'
import { WorkshopSignOutButton } from '@/components/workshop/WorkshopSignOutButton'
import { __resetRedeemedCache } from '@/lib/tickets/speakerStatus'
import { seal } from '@/lib/workshop/central-sign-in/seal'

const PLATFORM_SLUG = 'platform-org'
/** The host every request is on unless a case says otherwise. */
const HOST = 'conf.example.org'
const SESSION_COOKIE = '__Host-workshop-session'
const WEEK = 7 * 24 * 60 * 60

const isRecordRead = (query: unknown) =>
  String(query).includes('_type == "domainVerification"')

/** How many live reads of a host's record the page has spent. */
function recordReads(): number {
  return h.fetch.mock.calls.filter(([query]) => isRecordRead(query)).length
}

/** Make `host` one that may carry the portal's sign-in, for `conferenceId`. */
function proven(host: string, conferenceId = 'conf-1', domains = [host]) {
  const { record, conference } = provenClaim(
    host,
    { conferenceId },
    { _id: conferenceId, domains },
  )
  h.claims.set(record._id, { ...record, conference })
}

/** A request on `host`, as the browser sends it. */
function on(host: string) {
  beginRequest(new Headers({ host }))
}

interface Attendee {
  id: string
  email: string
  emailVerified: boolean
  name: string | null
}

/** The browser holds the session of a completed sign-in as `attendee`. */
async function signedInAs(
  attendee: Attendee,
  issuedFor: { host?: string; conferenceId?: string; ttl?: number } = {},
) {
  presentCookie(
    SESSION_COOKIE,
    await seal(
      'session',
      {
        userId: attendee.id,
        email: attendee.email,
        emailVerified: attendee.emailVerified,
        name: attendee.name,
        sessionId: 'session_01',
        host: issuedFor.host ?? HOST,
        conferenceId: issuedFor.conferenceId ?? 'conf-1',
      },
      issuedFor.ttl ?? WEEK,
    ),
  )
}

/** Render the portal page, with this query string. */
function renderPage(query: Record<string, string> = {}) {
  return WorkshopPage({ searchParams: Promise.resolve(query) })
}

function conference(orgId: string | null) {
  return {
    _id: 'conf-1',
    title: 'CNDN',
    ...(orgId ? { organization: { _ref: orgId, _type: 'reference' } } : {}),
  }
}

/** Every element in the tree the page RETURNED, without rendering components. */
function elementsOf(
  node: ReactNode,
): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elementsOf)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...elementsOf(node.props.children as ReactNode)]
}

/** Every `href` anywhere in that tree. */
function hrefsOf(node: ReactNode): string[] {
  return elementsOf(node)
    .map((element) => element.props.href)
    .filter((href): href is string => typeof href === 'string')
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
  h.claims.clear()
  h.fetch.mockImplementation(async (query, params) =>
    isRecordRead(query) ? (h.claims.get(params?.id ?? '') ?? null) : null,
  )
  proven(HOST)
  on(HOST)
  vi.stubEnv('NODE_ENV', 'production')
  __resetRedeemedCache()
  // A configured platform org that matches none of the tenants below, so a case
  // is platform ONLY when it points the contract at its own org id.
  vi.stubEnv('PLATFORM_ORG_ID', 'org-none')
  // Set in every deployment, for branding and other consumers. The portal must
  // build nothing from it — no link, no redirect target, no contact address —
  // and a use that only shows when it is set would pass with it unset.
  vi.stubEnv('NEXT_PUBLIC_URL', 'https://public.example.org')
  stubPlatformTicketingAccount()
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
  // A page view never writes a cookie: the session is not renewed (spec §6).
  expect(writtenCookies()).toEqual([])
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('workshop portal — feature OFF (paid plan, no ticketing credentials)', () => {
  beforeEach(() => {
    // #1295: a paid plan alone does not open the portal — the org's ticketing
    // must have credentials to decide access from, and Tenant Two has none.
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

  it('404s the portal page WITHOUT reading the host’s record or a session', async () => {
    expect(await is404(() => renderPage())).toBe(true)
    expect(h.fetch).not.toHaveBeenCalled()
  })
})

describe('workshop portal — feature OFF (community plan, even with ticketing)', () => {
  it('404s the layout and the page for a community tenant with its own ticketing account', async () => {
    stubOwnTicketingSecret('org-tenant2')
    mockGetConference.mockResolvedValue({
      conference: conference('org-tenant2'),
      error: null,
    })
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-tenant2',
      name: 'Tenant Two',
      slug: 'tenant-two',
      plan: 'community',
    })

    expect(await is404(() => WorkshopLayout({ children: null }))).toBe(true)
    expect(await is404(() => renderPage())).toBe(true)
    expect(h.fetch).not.toHaveBeenCalled()
  })
})

/**
 * #1295: a NON-PLATFORM pro tenant with its own ticketing account is let in by
 * plan — the case the old platform-org rule could never produce. The platform
 * org id points elsewhere throughout, so nothing here is identity-granted.
 */
describe('workshop portal — feature ON (non-platform pro tenant with its own ticketing)', () => {
  beforeEach(() => {
    stubOwnTicketingSecret('org-tenant2')
    mockGetConference.mockResolvedValue({
      conference: conference('org-tenant2'),
      error: null,
    })
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-tenant2',
      name: 'Tenant Two',
      slug: 'tenant-two',
      plan: 'pro',
    })
  })

  it('renders the segment layout', async () => {
    expect(await is404(() => WorkshopLayout({ children: null }))).toBe(false)
  })

  it('renders the portal page from ONE live read: the host’s record', async () => {
    expect(await is404(() => renderPage())).toBe(false)
    expect(recordReads()).toBe(1)
    expect(h.fetch).toHaveBeenCalledTimes(1)
  })
})

describe('workshop portal — unresolvable org fails CLOSED', () => {
  it('404s when the conference carries no organization', async () => {
    mockGetConference.mockResolvedValue({
      conference: conference(null),
      error: null,
    })

    expect(await is404(() => renderPage())).toBe(true)
    expect(await is404(() => WorkshopLayout({ children: null }))).toBe(true)
    expect(mockGetOrganizationById).not.toHaveBeenCalled()
  })

  it('404s when the organization document is missing', async () => {
    mockGetConference.mockResolvedValue({
      conference: conference('org-ghost'),
      error: null,
    })
    mockGetOrganizationById.mockResolvedValue(null)

    expect(await is404(() => renderPage())).toBe(true)
  })
})

describe('workshop portal — feature ON (platform org on the pro plan)', () => {
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
      plan: 'pro',
    })
  })

  it('renders the segment layout', async () => {
    expect(await is404(() => WorkshopLayout({ children: null }))).toBe(false)
  })

  it('renders the portal page as before', async () => {
    expect(await is404(() => renderPage())).toBe(false)
    expect(recordReads()).toBe(1)
  })
})

/**
 * #1294. The page renders from the SAME access decision the attendee procedures
 * enforce (`decideWorkshopPortalAccess`), so it cannot show a signup form the
 * API would refuse. Each refusal is exercised with the other conditions
 * satisfied and asserted on its own text.
 */
describe('workshop portal — signed-in attendee', () => {
  /** What tells the signed-out view apart from every signed-in one. */
  async function isSignedOut(query?: Record<string, string>) {
    return elementsOf(await renderPage(query))[0].type === WorkshopSignedOut
  }

  const ADA: Attendee = {
    id: 'workos-ada',
    email: 'ada@example.com',
    emailVerified: true,
    name: 'Ada Lovelace',
  }

  beforeEach(async () => {
    vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
    mockGetConference.mockResolvedValue({
      conference: conference('org-platform'),
      error: null,
    })
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-platform',
      name: 'Platform',
      slug: PLATFORM_SLUG,
      plan: 'pro',
    })
    await signedInAs(ADA)
  })

  it('shows the signup page to a verified ticket holder', async () => {
    const page = await renderPage()
    const text = textOf(page)

    // READ BUDGET: the page spends TWO live Sanity reads. ONE for the session
    // decision (the host's record, #1314) and the `ticketTypeRoles` lookup
    // from #1294.
    expect(recordReads()).toBe(1)
    expect(h.fetch).toHaveBeenCalledTimes(2)
    // The signups are listed, and stored, under the WorkOS user ID.
    expect(
      elementsOf(page).find((el) => 'userWorkOSId' in el.props)?.props,
    ).toMatchObject({
      userWorkOSId: 'workos-ada',
      userEmail: 'ada@example.com',
      userName: 'Ada Lovelace',
    })

    expect(text).toContain('Workshop Signup')
    expect(text).toContain('Ada Lovelace')
    expect(text).not.toContain('Workshop Access Required')
  })

  it('refuses an unverified email even when it matches a workshop ticket', async () => {
    await signedInAs({ ...ADA, emailVerified: false })

    const text = textOf(await renderPage())

    expect(text).toContain('Workshop Access Required')
    expect(text).toContain('Email Address Not Verified')
    expect(text).not.toContain('Workshop Ticket Required')
    expect(text).toContain('has not been verified')
    expect(ticketing.fetchEventTickets).not.toHaveBeenCalled()
  })

  it('refuses a verified attendee with no ticket', async () => {
    ticketing.fetchEventTickets.mockResolvedValue([])

    const text = textOf(await renderPage())

    expect(text).toContain('Workshop Access Required')
    expect(text).toContain('Workshop Ticket Required')
    expect(text).toContain(`No ticket found for ${ADA.email}`)
  })

  it('refuses, with a retry message, when the provider cannot answer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    ticketing.fetchEventTickets.mockRejectedValue(new Error('vendor down'))

    const text = textOf(await renderPage())

    // The provider WAS asked: an unconfigured or org-less conference produces
    // the same message without ever reaching it.
    expect(ticketing.fetchEventTickets).toHaveBeenCalledTimes(1)
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

    const text = textOf(await renderPage())

    expect(text).toContain('Workshop Access Required')
    expect(text).toContain('Unable to verify workshop ticket')
    // No provider to ask — not the provider-failure refusal above, which
    // carries the same message.
    expect(ticketing.fetchEventTickets).not.toHaveBeenCalled()
    expect(text).not.toContain('Welcome,')
  })
  it('greets by email when the session carries no name', async () => {
    await signedInAs({ ...ADA, name: null })

    const page = await renderPage()

    expect(textOf(page)).toMatch(/Welcome,\s+ada@example\.com/)
    expect(
      elementsOf(page).find((el) => 'userWorkOSId' in el.props)?.props.userName,
    ).toBe('ada@example.com')
  })

  /**
   * THE SESSION READ (#1314, spec §6). Each case is the session above with one
   * condition changed, and ends at the signed-out view. The same rule is proven
   * for the API, on sessions the real routes issued, in
   * `trpc.workshopUser.test.ts`.
   */
  describe('is signed out', () => {
    it('CONTROL: not with the session as it is', async () => {
      expect(await isSignedOut()).toBe(false)
    })

    it('once 7 days have passed, with the cookie still present', async () => {
      const now = new Date('2026-10-12T10:00:00Z')
      vi.useFakeTimers({ toFake: ['Date'], now })
      proven(HOST)
      await signedInAs(ADA)

      vi.setSystemTime(now.getTime() + (WEEK - 1) * 1000)
      expect(await isSignedOut()).toBe(false)
      vi.setSystemTime(now.getTime() + (WEEK + 1) * 1000)
      expect(await isSignedOut()).toBe(true)
    })

    it('with a session copied from another proven host', async () => {
      proven('other.example.org')
      // CONTROL: on that host, the session it was issued for counts.
      on('other.example.org')
      await signedInAs(ADA, { host: 'other.example.org' })
      expect(await isSignedOut()).toBe(false)

      on(HOST)
      await signedInAs(ADA, { host: 'other.example.org' })

      expect(await isSignedOut()).toBe(true)
    })

    it('with a session for a host whose name this host merely starts with', async () => {
      // Same conference, both proven: only the exact host tells them apart.
      const LONGER = `${HOST}.example.net`
      proven(LONGER)
      on(LONGER)
      await signedInAs(ADA, { host: HOST })

      expect(await isSignedOut()).toBe(true)
    })

    it('with a session for this conference once another conference claims the host', async () => {
      // The live record says conf-2; the session, and the page's cached
      // routing, still say conf-1. Only the live read can tell.
      proven(HOST, 'conf-2')
      await signedInAs(ADA)

      expect(await isSignedOut()).toBe(true)
    })

    it('with a session for the conference that claims the host now, while the page still serves another', async () => {
      // The host changed hands: the live record says conf-2, and so does the
      // session; the routing cache still resolves this request to conf-1.
      proven(HOST, 'conf-2')
      await signedInAs(ADA, { conferenceId: 'conf-2' })

      expect(await isSignedOut()).toBe(true)
    })

    it('with a hand-off token presented as a session', async () => {
      presentCookie(
        SESSION_COOKIE,
        await seal(
          'handoff',
          {
            userId: ADA.id,
            email: ADA.email,
            emailVerified: true,
            name: ADA.name,
            sessionId: 'session_01',
            host: HOST,
            conferenceId: 'conf-1',
            challenge: 'x'.repeat(43),
          },
          60,
        ),
      )

      expect(await isSignedOut()).toBe(true)
    })

    it('with the cookie under a name without the __Host- prefix', async () => {
      beginRequest(new Headers({ host: HOST }))
      presentCookie(
        'workshop-session',
        await seal(
          'session',
          {
            userId: ADA.id,
            email: ADA.email,
            emailVerified: true,
            name: ADA.name,
            sessionId: 'session_01',
            host: HOST,
            conferenceId: 'conf-1',
          },
          WEEK,
        ),
      )

      expect(await isSignedOut()).toBe(true)
    })
  })

  it('does not show the sign-in line to someone who is signed in', async () => {
    const page = await renderPage({ 'sign-in': 'incomplete' })

    expect(elementsOf(page).some((el) => el.type === WorkshopSignedOut)).toBe(
      false,
    )
    expect(textOf(page)).not.toContain('did not complete')
  })
})

/**
 * #1296, #1314. The page builds no sign-in URL of its own, and "Sign Out" is
 * the portal's own action, not NextAuth's route, which belongs to a different
 * auth system.
 */
describe('workshop portal — sign-in and sign-out', () => {
  beforeEach(() => {
    vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
    mockGetConference.mockResolvedValue({
      conference: conference('org-platform'),
      error: null,
    })
    // Pro plan: since #1295 the platform org holds workshops by plan (its
    // ticketing is the env account), not by identity.
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-platform',
      name: 'Platform',
      slug: PLATFORM_SLUG,
      plan: 'pro',
    })
  })

  it('signed out: renders the signed-out component and no link of its own', async () => {
    const page = await renderPage()

    const signedOut = elementsOf(page).filter(
      (element) => element.type === WorkshopSignedOut,
    )
    // The page hands the whole signed-out state to the component and adds no
    // link of its own. (What the component renders — and that it carries no
    // authorize URL — is pinned in `WorkshopPortalAuth.test.tsx`.)
    expect(signedOut).toHaveLength(1)
    expect(signedOut[0].props).toEqual({
      conferenceTitle: 'CNDN',
      signInIncomplete: false,
    })
    expect(hrefsOf(page)).toEqual([])
  })

  it('signed out after a refused redeem: tells the view sign-in did not complete', async () => {
    const page = await renderPage({ 'sign-in': 'incomplete' })

    expect(elementsOf(page)[0].type).toBe(WorkshopSignedOut)
    expect(elementsOf(page)[0].props.signInIncomplete).toBe(true)
  })

  it.each([
    ['another value', { 'sign-in': 'expired' }],
    ['another parameter', { error: 'incomplete' }],
  ])('signed out with %s: says nothing', async (_label, query) => {
    const page = await renderPage(query as Record<string, string>)

    expect(elementsOf(page)[0].props.signInIncomplete).toBe(false)
  })

  it.each([
    ['the signup page', { emailVerified: true }],
    ['a refusal', { emailVerified: false }],
  ])(
    'signed in, on %s: Sign Out is the portal’s action',
    async (_label, user) => {
      await signedInAs({
        id: 'workos-ada',
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        ...user,
      })

      const page = await renderPage()

      const buttons = elementsOf(page).filter(
        (element) => element.type === WorkshopSignOutButton,
      )
      expect(buttons).toHaveLength(1)
      expect(buttons[0].props.action).toBe(signOutOfWorkshop)
      expect(hrefsOf(page).filter((href) => href.includes('signout'))).toEqual(
        [],
      )
    },
  )
})

/**
 * A HOST THAT CANNOT SIGN IN (#1298): it may not receive a hand-off. The page
 * says that sign-up is not available, with the organizer's address and nothing
 * about why, and offers no way into a sign-in.
 */
describe('workshop portal — on a host that cannot sign in', () => {
  const MARKED = () => on('unregistered.example.org')

  beforeEach(() => {
    stubOwnTicketingSecret('org-tenant2')
    mockGetConference.mockResolvedValue({
      conference: {
        ...conference('org-tenant2'),
        contactEmail: 'hello@cndn.example.org',
        domains: ['unregistered.example.org'],
      },
      error: null,
    })
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-tenant2',
      name: 'Tenant Two',
      slug: 'tenant-two',
      plan: 'pro',
    })
  })

  it('decides from the Host header, whatever x-forwarded-host names', async () => {
    // A proven host named only by a header a client can send.
    beginRequest(
      new Headers({
        host: 'unregistered.example.org',
        'x-forwarded-host': HOST,
      }),
    )

    expect(elementsOf(await renderPage())[0].type).toBe(WorkshopUnavailable)
  })

  it('shows that sign-up is not available, with the contact address', async () => {
    MARKED()
    const page = await renderPage()

    expect(recordReads()).toBe(1)
    expect(elementsOf(page)[0].type).toBe(WorkshopUnavailable)
    expect(elementsOf(page)[0].props).toEqual({
      conferenceTitle: 'CNDN',
      contactEmail: 'hello@cndn.example.org',
      registrationClosed: false,
    })
    // Nothing that starts a sign-in.
    expect(elementsOf(page).some((el) => el.type === WorkshopSignedOut)).toBe(
      false,
    )
  })

  it('passes the view nothing about why — no host, state or error', async () => {
    MARKED()
    const page = await renderPage()
    // The view's props are its whole input, so this is everything it can say.
    expect(Object.keys(elementsOf(page)[0].props).sort()).toEqual([
      'conferenceTitle',
      'contactEmail',
      'registrationClosed',
    ])
  })

  it('says registration has closed, not "not available yet", once it has', async () => {
    mockGetConference.mockResolvedValue({
      conference: {
        ...conference('org-tenant2'),
        contactEmail: 'hello@cndn.example.org',
        domains: ['unregistered.example.org'],
        workshopRegistrationEnd: new Date(Date.now() - 60_000).toISOString(),
      },
      error: null,
    })
    MARKED()
    const page = await renderPage()

    expect(elementsOf(page)[0].type).toBe(WorkshopUnavailable)
    expect(elementsOf(page)[0].props.registrationClosed).toBe(true)
  })

  it('CONTROL: on a proven host the same tenant gets the signed-out view', async () => {
    const page = await renderPage()
    expect(elementsOf(page)[0].type).toBe(WorkshopSignedOut)
  })

  it('shows it to someone who holds a session too: no session counts on such a host', async () => {
    MARKED()
    await signedInAs(
      {
        id: 'workos-ada',
        email: 'ada@example.com',
        emailVerified: true,
        name: 'Ada Lovelace',
      },
      { host: 'unregistered.example.org' },
    )

    expect(elementsOf(await renderPage())[0].type).toBe(WorkshopUnavailable)
  })

  it('shows it on every host when WORKSHOP_AUTH_ORIGIN cannot be used, and reads nothing', async () => {
    // The conference's main host, proven: only the variable stands in the way.
    proven('unregistered.example.org')
    MARKED()
    expect(elementsOf(await renderPage())[0].type).toBe(WorkshopSignedOut)
    h.fetch.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', 'http://auth.example.org')

    expect(elementsOf(await renderPage())[0].type).toBe(WorkshopUnavailable)
    expect(recordReads()).toBe(0)
  })

  it('keeps the plain 404 for a tenant without workshops, marked or not', async () => {
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-tenant2',
      name: 'Tenant Two',
      slug: 'tenant-two',
      plan: 'community',
    })
    MARKED()
    expect(await is404(() => WorkshopLayout({ children: null }))).toBe(true)
    expect(await is404(() => renderPage())).toBe(true)
    expect(h.fetch).not.toHaveBeenCalled()
  })
})

/**
 * A SECONDARY HOST THAT CANNOT SIGN IN, while the conference's main host can
 * (#1298 review): the attendee is sent to the working portal instead of being
 * told sign-up is unavailable. The main host is decided by the same rule as
 * the email link (`workshopPortalUrl`), its record read live.
 */
describe('workshop portal — a refused secondary host', () => {
  /** `main.example.org` proven, for the conference that claims both hosts. */
  const mainCanSignIn = () =>
    proven('main.example.org', 'conf-1', [
      'main.example.org',
      'secondary.example.org',
    ])

  beforeEach(() => {
    stubOwnTicketingSecret('org-tenant2')
    mockGetConference.mockResolvedValue({
      conference: {
        ...conference('org-tenant2'),
        contactEmail: 'hello@cndn.example.org',
        domains: ['main.example.org', 'secondary.example.org'],
      },
      error: null,
    })
    mockGetOrganizationById.mockResolvedValue({
      _id: 'org-tenant2',
      name: 'Tenant Two',
      slug: 'tenant-two',
      plan: 'pro',
    })
  })

  /** A request on `host`, which is not proven itself. */
  const markedOn = on

  async function redirectOf(render: () => Promise<unknown>) {
    try {
      await render()
      return null
    } catch (error) {
      if (error instanceof RedirectError) return error.url
      throw error
    }
  }

  it('sends the attendee to the main host’s portal when that one can sign in', async () => {
    mainCanSignIn()
    markedOn('secondary.example.org')

    await expect(redirectOf(() => renderPage())).resolves.toBe(
      'https://main.example.org/workshop',
    )
  })

  it('shows the unavailable view when the main host cannot sign in either, after ONE more read', async () => {
    markedOn('secondary.example.org')

    const page = await renderPage()
    expect(elementsOf(page)[0].type).toBe(WorkshopUnavailable)
    // This host's own record, then the main host's.
    expect(recordReads()).toBe(2)
  })

  // The decision for this host was just taken from its own record.
  it('spends no second read on the main host itself', async () => {
    markedOn('main.example.org')

    const page = await renderPage()
    expect(elementsOf(page)[0].type).toBe(WorkshopUnavailable)
    expect(recordReads()).toBe(1)
  })

  it('never redirects from the main host to itself', async () => {
    // The main host is proven, so the link to it exists; an unusable
    // WORKSHOP_AUTH_ORIGIN still refuses a sign-in on every host. Following
    // the link from the main host would loop, in any spelling of it.
    mainCanSignIn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('WORKSHOP_AUTH_ORIGIN', 'http://auth.example.org')
    for (const host of [
      'main.example.org',
      'Main.Example.ORG',
      'main.example.org:443',
    ]) {
      markedOn(host)
      const page = await renderPage()
      expect(elementsOf(page)[0].type).toBe(WorkshopUnavailable)
    }
  })
})
