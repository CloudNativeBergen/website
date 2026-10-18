/**
 * @vitest-environment node
 *
 * EARLY ACCESS on the workshop portal page (#1346, spec
 * `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §7): every situation of the
 * table, what reaches the browser, and the reads one view makes.
 *
 * In the style of `portal-gate.test.tsx`: only external boundaries are
 * supplied (the conference and organization documents, the ticket provider,
 * and the LIVE Sanity client every read goes through, which counts them). The
 * page, the session read, the access decision, the window rule and the cached
 * read of the conference's links are real; the links are read by the real
 * query text (`groq-js`).
 *
 * NOT RUN: `'use cache: remote'` is inert under Vitest, so the read of the
 * links repeats on every view here. What is asserted is that it is ONE read,
 * keyed by the conference alone, whatever the cookie holds.
 */
import '../../helpers/workosEnv'
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest'
import {
  beginRequest,
  cookies,
  presentCookie,
  writtenCookies,
} from '../../helpers/nextHeadersJar'
import { provenClaim } from '../../helpers/domainClaims'
import { stubPlatformTicketingAccount } from '../../helpers/ticketingSecrets'
import type { VersionedSanityStore } from '../../helpers/versionedSanityStore'

const mockGetConference = vi.fn()

vi.mock('jose', async () => (await import('../../helpers/realJose')).realJose())

class NotFoundError extends Error {
  digest = 'NEXT_NOT_FOUND'
}
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFoundError('NEXT_NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new Error(`redirect to ${url}`)
  },
}))
vi.mock('next/headers', () => import('../../helpers/nextHeadersJar'))
vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  refresh: (...args: unknown[]) => h.refresh(...args),
  revalidateTag: (...args: unknown[]) => h.revalidateTag(...args),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    mockGetConference(...args),
  getConferenceForDomain: vi.fn(),
}))
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: async () => ({
    _id: 'org-platform',
    name: 'Platform',
    slug: 'platform-org',
    plan: 'pro',
  }),
  getOrganizationRefForCurrentConference: () => null,
}))

/**
 * THE LIVE CLIENT, and every read is counted (`h.fetch`). A host's record is
 * answered from `claims`; anything else runs as GROQ over the stored
 * documents, which the organizer's revoke below also writes to.
 */
const h = vi.hoisted(() => ({
  fetch:
    vi.fn<
      (
        query: string,
        params?: Record<string, unknown>,
        options?: unknown,
      ) => Promise<unknown>
    >(),
  claims: new Map<string, unknown>(),
  store: null as null | VersionedSanityStore,
  readStore: null as
    | null
    | ((
        query: string,
        params?: unknown,
        options?: unknown,
      ) => Promise<unknown>),
  revalidateTag: vi.fn(),
  refresh: vi.fn(),
  /** The exact text of the cached links' read (`cachedLinksQueryText`). */
  linksQuery: null as null | string,
}))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  const reader = h.store.clients.clientReadUncached as {
    fetch: NonNullable<typeof h.readStore>
  }
  h.readStore = reader.fetch
  return {
    ...h.store.clients,
    clientReadUncached: { ...reader, fetch: h.fetch },
  }
})
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))

const ticketing = vi.hoisted(() => ({
  fetchEventTickets: vi.fn(),
  resolve: vi.fn(),
}))
vi.mock('@/lib/tickets/provider', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/tickets/provider')>()),
  resolveTicketingProvider: ticketing.resolve,
}))

import { initTRPC } from '@trpc/server'
import { isValidElement, type ReactNode } from 'react'
import WorkshopPage from '@/app/(workshop)/workshop/page'
import { refreshWorkshopPortal } from '@/app/(workshop)/workshop/actions'
import { WorkshopNoTicket } from '@/components/workshop/WorkshopNoTicket'
import { WorkshopPortal } from '@/components/workshop/WorkshopPortal'
import { WorkshopSignedOut } from '@/components/workshop/WorkshopSignedOut'
import type { Context } from '@/server/trpc'
import { sponsorEarlyAccessRouter } from '@/server/routers/sponsorEarlyAccess'
import {
  WorkshopEarlyAccessBanner,
  WorkshopEarlyAccessInvalidNotice,
} from '@/components/workshop/WorkshopEarlyAccess'
import { __resetRedeemedCache } from '@/lib/tickets/speakerStatus'
import { seal } from '@/lib/workshop/central-sign-in/seal'
import { cachedLinksQueryText } from '../../helpers/cachedLinksRead'

beforeAll(async () => {
  h.fetch.mockImplementation((query, params, options) =>
    h.readStore!(query, params, options),
  )
  h.linksQuery = await cachedLinksQueryText(h.store!)
})

const HOST = 'conf.example.org'
const SESSION_COOKIE = '__Host-workshop-session'
const EARLY_ACCESS_COOKIE = '__Host-workshop-early-access'

/** The pinned clock: 14:00 in Oslo on Wednesday 10 June 2026. */
const NOW = '2026-06-10T12:00:00.000Z'
/** Monday 8 June, 09:00 in Oslo: two days ago. */
const SPONSOR_START = '2026-06-08T07:00:00.000Z'
/** Friday 12 June, 09:00 in Oslo: two days ahead. */
const SPONSOR_START_AHEAD = '2026-06-12T07:00:00.000Z'
/** Monday 15 June, 00:30 in Oslo. */
const OFFICIAL_OPENING = '2026-06-14T22:30:00.000Z'
const END = '2026-07-01T07:00:00.000Z'
const INSIDE_THE_WINDOW = {
  workshopRegistrationSponsorStart: SPONSOR_START,
  workshopRegistrationStart: OFFICIAL_OPENING,
  workshopRegistrationEnd: END,
}
const BEFORE_THE_SPONSOR_START = {
  ...INSIDE_THE_WINDOW,
  workshopRegistrationSponsorStart: SPONSOR_START_AHEAD,
}

const NOT_YET_OPEN = 'Workshop registration is not yet open'
const OPENS_OFFICIALLY =
  'Registration will open on Monday, June 15, 2026 at 12:30 AM'
const NOTICE =
  'This early access link is no longer valid. Ask whoever sent it to you for a new one.'

const LIVE = '4b1c9d2e-7a55-4f0a-9c3e-1f2a3b4c5d6e'
const OTHER_LIVE = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const REVOKED = '9f8e7d6c-5b4a-4321-8fed-cba987654321'

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const sponsor = (
  id: string,
  token: string | undefined,
  company = 'sponsor-acme',
) => ({
  _id: id,
  _type: 'sponsorForConference',
  _rev: 'r0',
  conference: ref('conf-1'),
  sponsor: ref(company),
  status: 'closed-won',
  ...(token && { workshopEarlyAccessToken: token }),
})
const DATASET = [
  { _id: 'conf-1', _type: 'conference', organization: ref('org-platform') },
  { _id: 'sponsor-acme', _type: 'sponsor', name: 'Acme AS' },
  { _id: 'sponsor-globex', _type: 'sponsor', name: 'Globex' },
  sponsor('sfc-acme', LIVE),
  sponsor('sfc-globex', OTHER_LIVE, 'sponsor-globex'),
  // Revoked: the published document holds no token, a draft still does.
  sponsor('sfc-revoked', undefined),
  sponsor('drafts.sfc-revoked', REVOKED),
]

const isRecordRead = (query: unknown) =>
  String(query).includes('_type == "domainVerification"')
const isLinksRead = (query: unknown) =>
  String(query).includes('workshopEarlyAccessToken')

/** Every live read this view made, by kind, with what each was keyed by. */
function liveReads() {
  const calls = h.fetch.mock.calls
  return {
    total: calls.length,
    record: calls.filter(([query]) => isRecordRead(query)).length,
    links: calls
      .filter(([query]) => isLinksRead(query))
      .map(([, params]) => params),
  }
}

/** Everything a cookie store was asked for, by name. */
let cookiesAsked: string[] = []

/** A new request on the host, signed in or not, holding these cookies. */
async function request({
  signedIn = true,
  earlyAccess,
}: { signedIn?: boolean; earlyAccess?: string } = {}) {
  beginRequest(new Headers({ host: HOST }))
  if (signedIn) {
    presentCookie(
      SESSION_COOKIE,
      await seal(
        'session',
        {
          userId: 'workos-ada',
          email: 'ada@example.com',
          emailVerified: true,
          name: 'Ada Lovelace',
          sessionId: 'session_01',
          host: HOST,
          conferenceId: 'conf-1',
        },
        7 * 24 * 60 * 60,
      ),
    )
  }
  if (earlyAccess) presentCookie(EARLY_ACCESS_COOKIE, earlyAccess)
  const store = await cookies()
  const get = store.get.bind(store)
  cookiesAsked = []
  vi.spyOn(store, 'get').mockImplementation((...args) => {
    cookiesAsked.push(String(args[0]))
    return get(...(args as Parameters<typeof get>))
  })
  h.fetch.mockClear()
}

function conferenceWith(times: Record<string, string | undefined>) {
  mockGetConference.mockResolvedValue({
    conference: {
      _id: 'conf-1',
      title: 'CNDN',
      organization: { _ref: 'org-platform', _type: 'reference' },
      ...times,
    },
    error: null,
  })
}

type Element = React.ReactElement<Record<string, unknown>>

/**
 * Every element of what the page returned, with the portal's own plain
 * components rendered: its three views, and the early-access banner and
 * notice. Client components (the list) are left as they were handed over.
 */
function elementsOf(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elementsOf)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  const rendered = [
    WorkshopEarlyAccessBanner,
    WorkshopEarlyAccessInvalidNotice,
    WorkshopNoTicket,
    WorkshopPortal,
    WorkshopSignedOut,
  ] as unknown[]
  if (rendered.includes(node.type)) {
    return elementsOf(
      (node.type as (props: unknown) => ReactNode)(node.props) as ReactNode,
    )
  }
  return [node, ...elementsOf(node.props.children as ReactNode)]
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children)
  }
  return ''
}

/** Every string and number anywhere inside `value`, keys included. */
function everyValueIn(value: unknown, seen = new WeakSet<object>()): string[] {
  if (typeof value === 'string' || typeof value === 'number') {
    return [String(value)]
  }
  if (typeof value !== 'object' || value === null || seen.has(value)) return []
  seen.add(value)
  return Object.entries(value).flatMap(([key, inner]) => [
    key,
    ...everyValueIn(inner, seen),
  ])
}

/** One view of the portal, as values. */
async function view(query: Record<string, string> = {}) {
  const page = await WorkshopPage({ searchParams: Promise.resolve(query) })
  const elements = elementsOf(page)
  return {
    heading: textOf(elements.find((el) => el.type === 'h1')),
    /** The headings of the banners shown. */
    banners: elements.filter((el) => el.type === 'h3').map(textOf),
    /** Every line of status text. */
    status: elements
      .filter((el) => el.props.role === 'status')
      .map((el) => textOf(el).replace(/\s+/g, ' ').trim()),
    text: elements
      .filter((el) => typeof el.type === 'string')
      .map((el) =>
        [el.props.children]
          .flat()
          .filter((child) => typeof child === 'string')
          .join(''),
      )
      .join(' ')
      .replace(/\s+/g, ' '),
    /** What the list, a client component, is handed: all of it reaches the browser. */
    list: elements.find((el) => 'userWorkOSId' in el.props)?.props,
    /** Every prop of every element: what the response is made from. */
    sent: everyValueIn(elements.map((el) => el.props)).join('\n'),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) })
  h.claims.clear()
  h.store!.reset(DATASET)
  h.fetch.mockImplementation(async (query, params = {}, options) => {
    if (isRecordRead(query)) return h.claims.get(String(params.id)) ?? null
    return h.readStore!(query, params, options)
  })
  const { record, conference } = provenClaim(
    HOST,
    { conferenceId: 'conf-1' },
    { _id: 'conf-1', domains: [HOST] },
  )
  h.claims.set(record._id, { ...record, conference })
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
  stubPlatformTicketingAccount()
  __resetRedeemedCache()
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
  conferenceWith(INSIDE_THE_WINDOW)
})

afterEach(() => {
  // A page view never writes a cookie.
  expect(writtenCookies()).toEqual([])
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('a person with early access', () => {
  it('before the sponsor start time: one banner, naming the sponsor and that time', async () => {
    conferenceWith(BEFORE_THE_SPONSOR_START)
    await request({ earlyAccess: LIVE })

    const portal = await view()

    expect(portal.heading).toBe('Workshop Signup')
    // The early-access banner takes the place of the one naming the official
    // opening: one banner, not two.
    expect(portal.banners).toEqual([
      'Early access through Acme AS opens Friday, June 12, 2026 at 9:00 AM',
    ])
    expect(portal.text).not.toContain(OPENS_OFFICIALLY)
    expect(portal.list).toMatchObject({
      earlyAccess: true,
      workshopRegistrationSponsorStart: SPONSOR_START_AHEAD,
    })
  })

  it('inside the window: the line that says so, no banner, and a list that can sign up', async () => {
    await request({ earlyAccess: LIVE })

    const portal = await view()

    expect(portal.heading).toBe('Workshop Signup')
    expect(portal.banners).toEqual([])
    expect(portal.status).toEqual(['You have early access through Acme AS'])
    expect(portal.text).not.toContain(OPENS_OFFICIALLY)
    expect(portal.list).toMatchObject({
      earlyAccess: true,
      workshopRegistrationSponsorStart: SPONSOR_START,
      workshopRegistrationStart: OFFICIAL_OPENING,
      workshopRegistrationEnd: END,
    })
  })

  // The conference has two sponsors with a live link each: the page names
  // the sponsor whose link the cookie holds, not whichever link comes first.
  it.each([
    ['Acme AS', LIVE],
    ['Globex', OTHER_LIVE],
  ])('names %s for a cookie of that sponsor’s link', async (name, token) => {
    await request({ earlyAccess: token })

    const portal = await view()

    expect(portal.status).toEqual([`You have early access through ${name}`])
  })

  // One token on two published documents (a copy made by a script): the
  // name shown is that of the sponsor with the lowest id, which is also the
  // one a sign-up records. Stored here after the one with the higher id.
  it('with one token on two sponsors, names the one with the lowest id', async () => {
    h.store!.put(sponsor('sfc-aardvark', LIVE, 'sponsor-globex'))
    await request({ earlyAccess: LIVE })

    const portal = await view()

    expect(portal.status).toEqual(['You have early access through Globex'])
  })

  it('after the official opening: the portal as everyone sees it, and nothing is looked up', async () => {
    vi.setSystemTime(new Date(OFFICIAL_OPENING))
    await request({ earlyAccess: LIVE })

    const portal = await view()

    expect(portal.heading).toBe('Workshop Signup')
    expect(portal.banners).toEqual([])
    expect(portal.status).toEqual([])
    expect(portal.sent).not.toContain('early access')
    expect(portal.sent).not.toContain('Acme AS')
    expect(portal.list?.earlyAccess).toBe(false)
    expect(portal.list?.workshopRegistrationSponsorStart).toBeUndefined()
    expect(liveReads().links).toEqual([])
    expect(cookiesAsked).not.toContain(EARLY_ACCESS_COOKIE)
  })

  it('with no sponsor start time set: the portal as everyone sees it', async () => {
    conferenceWith({
      workshopRegistrationStart: OFFICIAL_OPENING,
      workshopRegistrationEnd: END,
    })
    await request({ earlyAccess: LIVE })

    const portal = await view()

    expect(portal.banners).toEqual([NOT_YET_OPEN])
    expect(portal.text).toContain(OPENS_OFFICIALLY)
    expect(portal.status).toEqual([])
    expect(liveReads().links).toEqual([])
  })
})

describe('early access by ticket type', () => {
  const byTicket = () =>
    mockGetConference.mockResolvedValue({
      conference: {
        _id: 'conf-1',
        title: 'CNDN',
        organization: { _ref: 'org-platform', _type: 'reference' },
        ...INSIDE_THE_WINDOW,
        workshopEarlyAccessTicketTypes: ['Workshop + Conference (2 days)'],
      },
      error: null,
    })

  it('a holder of the chosen type with no cookie: the open form and the ticket line', async () => {
    byTicket()
    await request({})

    const portal = await view()

    expect(portal.banners).toEqual([])
    expect(portal.status).toEqual([
      'You have early access through your “Workshop + Conference (2 days)” ticket',
    ])
    expect(portal.text).not.toContain(OPENS_OFFICIALLY)
    expect(portal.list).toMatchObject({ earlyAccess: true })
  })

  it('with a live cookie too, the line names the sponsor', async () => {
    byTicket()
    await request({ earlyAccess: LIVE })

    const portal = await view()

    expect(portal.status).toEqual(['You have early access through Acme AS'])
    expect(portal.list).toMatchObject({ earlyAccess: true })
  })
})

describe('a person without early access, inside the window', () => {
  it.each([
    ['no cookie', undefined],
    ['a cookie whose link was revoked', REVOKED],
    ['a cookie that was made up', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'],
  ])(
    '%s: the portal as everyone sees it, with no notice',
    async (_case, token) => {
      await request({ earlyAccess: token })

      const portal = await view()

      expect(portal.heading).toBe('Workshop Signup')
      expect(portal.banners).toEqual([NOT_YET_OPEN])
      expect(portal.text).toContain(OPENS_OFFICIALLY)
      expect(portal.status).toEqual([])
      expect(portal.text).not.toContain(NOTICE)
      // The sponsor start time is not this person's to see.
      expect(portal.list?.earlyAccess).toBe(false)
      expect(portal.sent).not.toContain(SPONSOR_START)
      expect(portal.sent).not.toContain('Acme AS')
    },
  )
})

describe('the views that admit nobody read nothing about the cookie', () => {
  it('signed out, holding a live cookie', async () => {
    await request({ signedIn: false, earlyAccess: LIVE })

    const portal = await view()

    expect(portal.text).toContain('Sign in to register for workshops at CNDN.')
    expect(cookiesAsked).toEqual([SESSION_COOKIE])
    expect(liveReads().links).toEqual([])
    expect(portal.sent).not.toContain('Acme AS')
    expect(portal.status).toEqual([])
    // The same person, signed in with a workshop ticket, has early access.
    await request({ earlyAccess: LIVE })
    expect((await view()).status).toEqual([
      'You have early access through Acme AS',
    ])
  })

  it('signed in without a workshop ticket, holding a live cookie', async () => {
    ticketing.fetchEventTickets.mockResolvedValue([])
    await request({ earlyAccess: LIVE })

    const portal = await view()

    expect(portal.heading).toBe('Workshop Access Required')
    expect(cookiesAsked).toEqual([SESSION_COOKIE])
    expect(liveReads().links).toEqual([])
    expect(portal.sent).not.toContain('Acme AS')
    expect(portal.status).toEqual([])
  })
})

describe('just opened a link that is not live', () => {
  const marker = { 'early-access': 'invalid' }

  it('signed out: the signed-out view with the notice', async () => {
    await request({ signedIn: false })

    expect((await view(marker)).status).toEqual([NOTICE])
    expect((await view()).status).toEqual([])
  })

  it('without a workshop ticket: the no-ticket view with the notice', async () => {
    ticketing.fetchEventTickets.mockResolvedValue([])
    await request()

    const portal = await view(marker)

    expect(portal.heading).toBe('Workshop Access Required')
    expect(portal.status).toEqual([NOTICE])
  })

  it('with a workshop ticket: the portal as they would otherwise see it, with the notice', async () => {
    await request()

    const portal = await view(marker)

    expect(portal.heading).toBe('Workshop Signup')
    expect(portal.status).toEqual([NOTICE])
    expect(portal.banners).toEqual([NOT_YET_OPEN])
    expect((await view({ 'early-access': 'other' })).status).toEqual([])
  })

  it('still holding an older, live cookie: the notice, and the early access they have', async () => {
    await request({ earlyAccess: LIVE })

    expect((await view(marker)).status).toEqual([
      NOTICE,
      'You have early access through Acme AS',
    ])
  })
})

/**
 * EVERYTHING A VIEW SENDS TO THE BROWSER: the server components are rendered
 * down to markup, and a client component (it uses a hook, so it cannot be
 * rendered here) contributes every prop it is handed, since props of a client
 * component are serialised into the response.
 */
async function sentToBrowser(
  node: unknown,
  out: string[] = [],
): Promise<string[]> {
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) await sentToBrowser(child, out)
    return out
  }
  if (!isValidElement<Record<string, unknown>>(node)) return out
  const { children, ...props } = node.props
  if (typeof node.type === 'function') {
    let rendered: unknown
    try {
      rendered = await (node.type as (props: unknown) => unknown)(node.props)
    } catch {
      out.push(...everyValueIn(props))
      return sentToBrowser(children, out)
    }
    return sentToBrowser(rendered, out)
  }
  out.push(...everyValueIn(props))
  return sentToBrowser(children, out)
}

describe('what reaches the browser', () => {
  const HASH = /[0-9a-f]{64}/
  const views: [
    string,
    { earlyAccess?: string; signedIn?: boolean; ticket?: boolean; at?: string },
    { sponsor: boolean; reaches: string },
  ][] = [
    [
      'signed out, holding a live cookie',
      { signedIn: false, earlyAccess: LIVE },
      { sponsor: false, reaches: 'Sign in to register for workshops at ' },
    ],
    [
      'no workshop ticket, holding a live cookie',
      { ticket: false, earlyAccess: LIVE },
      { sponsor: false, reaches: 'Workshop Access Required' },
    ],
    [
      'admitted, no cookie',
      {},
      { sponsor: false, reaches: 'Workshop registration is not yet open' },
    ],
    [
      'admitted, a revoked cookie',
      { earlyAccess: REVOKED },
      { sponsor: false, reaches: 'Workshop registration is not yet open' },
    ],
    [
      'admitted, a live cookie inside the window',
      { earlyAccess: LIVE },
      { sponsor: true, reaches: 'You have early access through ' },
    ],
    [
      'admitted, a live cookie after the official opening',
      { earlyAccess: LIVE, at: OFFICIAL_OPENING },
      { sponsor: false, reaches: 'Workshop Signup' },
    ],
  ]

  it.each(views)(
    '%s: no token, no hash, no other sponsor, with or without the notice',
    async (_view, { ticket = true, at, ...holding }, expected) => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      if (!ticket) ticketing.fetchEventTickets.mockResolvedValue([])
      if (at) vi.setSystemTime(new Date(at))

      for (const query of [{}, { 'early-access': 'invalid' }]) {
        await request(holding)
        const sent = (
          await sentToBrowser(
            await WorkshopPage({ searchParams: Promise.resolve(query) }),
          )
        ).join('\n')

        // The view was rendered down to its text, and the list's props are in.
        expect(sent).toContain(expected.reaches)
        for (const token of [LIVE, OTHER_LIVE, REVOKED]) {
          expect(sent).not.toContain(token)
        }
        expect(sent).not.toMatch(HASH)
        expect(sent).not.toContain('Globex')
        expect(sent.includes('Acme AS')).toBe(expected.sponsor)
        // The sponsor start time goes only with early access.
        expect(sent.includes(SPONSOR_START)).toBe(expected.sponsor)
      }
    },
  )

  it('that action refreshes the page, and does nothing else', async () => {
    await request({ earlyAccess: LIVE })

    await refreshWorkshopPortal()

    expect(h.refresh.mock.calls).toEqual([[]])
    expect(h.fetch).not.toHaveBeenCalled()
    expect(h.revalidateTag).not.toHaveBeenCalled()
  })

  it('the list is handed the action that renders the page again', async () => {
    await request({ earlyAccess: LIVE })

    expect((await view()).list?.onEarlyAccessRefused).toBe(
      refreshWorkshopPortal,
    )
  })
})

describe('the live reads one portal view makes', () => {
  it('without the cookie: the host’s record and nothing about links, as before', async () => {
    await request()
    await view()

    expect(liveReads()).toMatchObject({ total: 2, record: 1, links: [] })
  })

  it('with the cookie: one more, the conference’s links, keyed by the conference alone', async () => {
    await request({ earlyAccess: LIVE })
    await view()
    const withLive = liveReads()
    await request({ earlyAccess: REVOKED })
    await view()
    const withRevoked = liveReads()

    expect(withLive.total).toBe(3)
    // Whatever the cookie holds, it is the same read: the one the cache holds
    // per conference.
    expect(withLive.links).toEqual([{ conferenceId: 'conf-1' }])
    expect(withRevoked).toEqual(withLive)
  })

  it.each([
    ['a word', 'early-access'],
    ['a very long value', 'a'.repeat(4000)],
  ])(
    'a cookie that is not a token (%s) reads nothing about links',
    async (_case, value) => {
      await request({ earlyAccess: value })
      const portal = await view()

      expect(liveReads()).toMatchObject({ total: 2, links: [] })
      expect(portal.banners).toEqual([NOT_YET_OPEN])
    },
  )
})

describe('after an organizer revokes the link', () => {
  function organizer() {
    const speaker = { _id: 'sp-admin', organizerOrgIds: ['org-platform'] }
    const user = { email: 'organizer@example.com', name: 'Organizer' }
    return initTRPC
      .context<Context>()
      .create()
      .createCallerFactory(sponsorEarlyAccessRouter)({
      req: { headers: new Headers(), url: `https://${HOST}` },
      session: { user, speaker },
      speaker,
      user,
      workosUser: null,
      ipAddress: '127.0.0.1',
    } as unknown as Context)
  }

  it('the links are expired at once, and the next view renders without early access or a notice', async () => {
    await request({ earlyAccess: LIVE })
    expect((await view()).status).toEqual([
      'You have early access through Acme AS',
    ])

    await organizer().revoke({ sponsorForConferenceId: 'sfc-acme' })

    // What makes the NEXT view read the links again, in a deployment.
    expect(h.revalidateTag.mock.calls).toEqual([
      ['sanity:workshop-early-access-conf-1', { expire: 0 }],
    ])
    await request({ earlyAccess: LIVE })
    const portal = await view()
    expect(portal.status).toEqual([])
    expect(portal.banners).toEqual([NOT_YET_OPEN])
    expect(portal.list?.earlyAccess).toBe(false)
    expect(portal.sent).not.toContain('Acme AS')
  })
})

describe('when the links cannot be read', () => {
  it('the portal is shown as everyone sees it, and the failure is logged', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.store!.failReadsThat((read) => read.query === h.linksQuery)
    await request({ earlyAccess: LIVE })

    const portal = await view()

    expect(portal.heading).toBe('Workshop Signup')
    expect(portal.banners).toEqual([NOT_YET_OPEN])
    expect(portal.text).toContain(OPENS_OFFICIALLY)
    expect(portal.status).toEqual([])
    expect(portal.list?.earlyAccess).toBe(false)
    expect(logged).toHaveBeenCalledTimes(1)
    // The read was made, and it is the one that failed.
    expect(liveReads().links).toEqual([{ conferenceId: 'conf-1' }])
  })
})
