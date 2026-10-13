/**
 * @vitest-environment node
 *
 * `GET /workshop/early-access/<token>`: opening a sponsor's early-access link
 * (#1346, spec §5). Request in, response out, and the reads it makes.
 *
 * REAL: the route, the destination policy, the cookie, and the cached read of
 * the conference's links with its query text (`groq-js`).
 * SUPPLIED: the conference the Host resolves to (the cached read the portal
 * page makes), the workshop feature gate, the host's verification record
 * (`getDomainClaim`, the LIVE read that decides whether a host can sign in)
 * and `next/cache`.
 * NOT RUN: `'use cache: remote'` is inert under Vitest. The tests assert that
 * the one read of the links never depends on the token; how often a
 * deployment repeats that read is not observable here.
 */
import '../../helpers/workosEnv'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { DomainClaim } from '@/lib/domain-verification/types'
import { claimsById, provenClaim } from '../../helpers/domainClaims'
import type { VersionedSanityStore } from '../../helpers/versionedSanityStore'

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  getConference: vi.fn(),
  workshopsEnabled: vi.fn<(c: unknown) => Promise<boolean>>(),
  getDomainClaim: vi.fn<(id: string) => Promise<DomainClaim | null>>(),
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: h.workshopsEnabled,
}))
vi.mock('@/lib/domain-verification/sanity', () => ({
  getDomainClaim: h.getDomainClaim,
}))
vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}))

import { GET } from '@/app/(workshop)/workshop/early-access/[token]/route'

const AUTH = 'auth.example.org'
const MAIN = 'conf.example.org'
const SECONDARY = 'conf-alias.example.org'
const CONF = 'conf-a'
const COOKIE = '__Host-workshop-early-access'

const NOW = '2026-10-13T10:00:00Z'
/** A week ahead: Tuesday 20 October 2026, 08:00 UTC. */
const OFFICIAL_OPENING = '2026-10-20T08:00:00.000Z'

const LIVE = '4b1c9d2e-7a55-4f0a-9c3e-1f2a3b4c5d6e'
const OTHER_LIVE = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const REVOKED = '9f8e7d6c-5b4a-4321-8fed-cba987654321'
const OTHER_CONFERENCE = '11111111-2222-4333-8444-555555555555'
const NEVER_EXISTED = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const EVERY_TOKEN = [LIVE, OTHER_LIVE, REVOKED, OTHER_CONFERENCE]

const store = () => h.store!
const ref = (id: string) => ({ _type: 'reference', _ref: id })
const sponsor = (
  id: string,
  token: string | undefined,
  conferenceId = CONF,
) => ({
  _id: id,
  _type: 'sponsorForConference',
  conference: ref(conferenceId),
  sponsor: ref('sponsor-acme'),
  status: 'closed-won',
  ...(token && { workshopEarlyAccessToken: token }),
})

const DATASET = [
  { _id: 'sponsor-acme', _type: 'sponsor', name: 'Acme AS' },
  sponsor('sfc-acme', LIVE),
  sponsor('sfc-other', OTHER_LIVE),
  // Revoked: the published document holds no token, a draft still does.
  sponsor('sfc-revoked', undefined),
  sponsor('drafts.sfc-revoked', REVOKED),
  sponsor('sfc-elsewhere', OTHER_CONFERENCE, 'conf-b'),
]

function conference(overrides: Record<string, unknown> = {}) {
  return {
    _id: CONF,
    title: 'Example Conf',
    organization: { _ref: 'org-1' },
    domains: [MAIN, SECONDARY],
    workshopRegistrationStart: OFFICIAL_OPENING,
    ...overrides,
  }
}

/** Someone opening `/workshop/early-access/<token>` on `host`. */
function open(token: string, host = MAIN, cookie?: string) {
  const headers = new Headers({ host })
  if (cookie) headers.set('cookie', cookie)
  return GET(
    new NextRequest(
      `https://${host}/workshop/early-access/${encodeURIComponent(token)}`,
      { headers },
    ),
    { params: Promise.resolve({ token }) },
  )
}

/** Everything a browser is sent: status, every header, the body. */
async function everythingSent(response: Response) {
  return {
    status: response.status,
    headers: [...response.headers.entries()],
    body: await response.clone().text(),
  }
}
const sentText = async (response: Response) =>
  JSON.stringify(await everythingSent(response))

/** Every read the request made, live or of the links. */
const reads = () => ({
  hostDecision: h.getDomainClaim.mock.calls.map(([id]) => id),
  sanity: store().reads.map(({ client, query, params }) => ({
    client,
    query,
    params,
  })),
})

function expectUncachedAndNoReferrer(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('referrer-policy')).toBe('no-referrer')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ now: new Date(NOW) })
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('PLATFORM_DOMAIN_SUFFIX', 'konf.run')
  vi.stubEnv('WORKSHOP_AUTH_ORIGIN', `https://${AUTH}`)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  store().reset(DATASET)
  h.getConference.mockResolvedValue({
    conference: conference(),
    domain: MAIN,
    error: null,
  })
  h.workshopsEnabled.mockResolvedValue(true)
  // Only the main host can sign in.
  h.getDomainClaim.mockImplementation(
    claimsById(
      provenClaim(MAIN, {}, { _id: CONF, domains: [MAIN, SECONDARY] }),
    ),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('a live link', () => {
  it('sets the cookie and forwards to the portal page', async () => {
    const response = await open(LIVE)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/workshop')
    // The token and nothing else, host-only (`__Host-`, no Domain), not
    // readable by scripts, until the official opening.
    expect(response.headers.getSetCookie()).toEqual([
      `${COOKIE}=${LIVE}; Path=/; Expires=Tue, 20 Oct 2026 08:00:00 GMT; Secure; HttpOnly; SameSite=lax`,
    ])
    expectUncachedAndNoReferrer(response)
    expect(console.error).not.toHaveBeenCalled()
  })

  it("opening a second sponsor's link replaces the cookie", async () => {
    const response = await open(OTHER_LIVE, MAIN, `${COOKIE}=${LIVE}`)

    expect(response.headers.getSetCookie()).toEqual([
      `${COOKIE}=${OTHER_LIVE}; Path=/; Expires=Tue, 20 Oct 2026 08:00:00 GMT; Secure; HttpOnly; SameSite=lax`,
    ])
  })

  it.each([
    ['no official opening is set', undefined],
    ['the official opening has passed', '2026-10-13T09:59:59.000Z'],
    ['the official opening is this very moment', '2026-10-13T10:00:00.000Z'],
  ])('sets nothing and shows no notice when %s', async (_case, opening) => {
    h.getConference.mockResolvedValue({
      conference: conference({ workshopRegistrationStart: opening }),
      domain: MAIN,
      error: null,
    })

    const response = await open(LIVE)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/workshop')
    expect(response.headers.getSetCookie()).toEqual([])
    expectUncachedAndNoReferrer(response)
  })
})

describe('a link that is not live', () => {
  it.each([
    ['a token that never existed', NEVER_EXISTED],
    ['a revoked token a draft still holds', REVOKED],
    ["another conference's token", OTHER_CONFERENCE],
  ])(
    'forwards to the portal page with the notice and sets nothing: %s',
    async (_case, token) => {
      const response = await open(token)

      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe(
        '/workshop?early-access=invalid',
      )
      expect(response.headers.getSetCookie()).toEqual([])
      expectUncachedAndNoReferrer(response)
    },
  )

  it('answers the three identically, down to every header', async () => {
    const [never, revoked, elsewhere] = await Promise.all(
      [NEVER_EXISTED, REVOKED, OTHER_CONFERENCE].map(async (token) =>
        everythingSent(await open(token)),
      ),
    )

    expect(revoked).toEqual(never)
    expect(elsewhere).toEqual(never)
  })

  it('leaves an existing cookie as it is', async () => {
    const response = await open(NEVER_EXISTED, MAIN, `${COOKIE}=${LIVE}`)

    // No Set-Cookie at all: nothing replaces or clears the one the browser has.
    expect(response.headers.getSetCookie()).toEqual([])
    expect(response.headers.get('location')).toBe(
      '/workshop?early-access=invalid',
    )
  })

  it('gets the notice whatever the times are', async () => {
    h.getConference.mockResolvedValue({
      conference: conference({ workshopRegistrationStart: undefined }),
      domain: MAIN,
      error: null,
    })

    const response = await open(NEVER_EXISTED)

    expect(response.headers.get('location')).toBe(
      '/workshop?early-access=invalid',
    )
  })

  it('the other conference’s token is live on that conference’s host', async () => {
    h.getConference.mockResolvedValue({
      conference: conference({ _id: 'conf-b' }),
      domain: MAIN,
      error: null,
    })
    h.getDomainClaim.mockImplementation(
      claimsById(provenClaim(MAIN, {}, { _id: 'conf-b' })),
    )

    const response = await open(OTHER_CONFERENCE)

    expect(response.headers.get('location')).toBe('/workshop')
    expect(response.headers.getSetCookie()[0]).toContain(
      `${COOKIE}=${OTHER_CONFERENCE};`,
    )
  })
})

describe('before anything is read about the token', () => {
  it('a conference without workshops gets the 404 the portal gives, and nothing is read', async () => {
    h.workshopsEnabled.mockResolvedValue(false)

    const response = await open(LIVE)

    expect(response.status).toBe(404)
    expect(response.headers.getSetCookie()).toEqual([])
    expectUncachedAndNoReferrer(response)
    expect(reads()).toEqual({ hostDecision: [], sanity: [] })
    // The identical request for a conference with workshops opens the link.
    h.workshopsEnabled.mockResolvedValue(true)
    expect((await open(LIVE)).status).toBe(307)
  })

  it('a host that resolves to no conference gets a 404, and nothing is read', async () => {
    h.getConference.mockResolvedValue({
      conference: null,
      domain: MAIN,
      error: new Error('no conference'),
    })

    const response = await open(LIVE)

    expect(response.status).toBe(404)
    expect(reads()).toEqual({ hostDecision: [], sanity: [] })
    expect(h.workshopsEnabled).not.toHaveBeenCalled()
  })

  it('the auth host gets a 404, and nothing is read', async () => {
    const response = await open(LIVE, AUTH)

    expect(response.status).toBe(404)
    expect(h.getConference).not.toHaveBeenCalled()
    expect(reads()).toEqual({ hostDecision: [], sanity: [] })
  })
})

describe('a host that cannot sign in', () => {
  it('forwards to the same address on the main host when that one can, and sets nothing', async () => {
    const response = await open(LIVE, SECONDARY)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      `https://${MAIN}/workshop/early-access/${LIVE}`,
    )
    expect(response.headers.getSetCookie()).toEqual([])
    expectUncachedAndNoReferrer(response)
    // Nothing is read about the token here: the main host answers for it.
    expect(reads().sanity).toEqual([])
  })

  it('does not forward the token to a main host that another conference claims now', async () => {
    // The conference is read through a cache: its main domain has since
    // changed hands, and can sign people in to ANOTHER conference.
    h.getDomainClaim.mockImplementation(
      claimsById(provenClaim(MAIN, {}, { _id: 'conf-b', domains: [MAIN] })),
    )

    const response = await open(LIVE, SECONDARY)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/workshop')
    expect(response.headers.getSetCookie()).toEqual([])
    expectUncachedAndNoReferrer(response)
    expect(await sentText(response)).not.toContain(LIVE)
    // The same two live reads as a forward makes, and nothing about links.
    expect(reads()).toEqual({
      hostDecision: [
        `domainVerification.${SECONDARY}`,
        `domainVerification.${MAIN}`,
      ],
      sanity: [],
    })
  })

  it('makes the same two live reads when it does forward', async () => {
    await open(LIVE, SECONDARY)

    expect(reads()).toEqual({
      hostDecision: [
        `domainVerification.${SECONDARY}`,
        `domainVerification.${MAIN}`,
      ],
      sanity: [],
    })
  })

  it('forwards to the portal page, never to itself, when it is the main host', async () => {
    h.getDomainClaim.mockResolvedValue(null)

    const response = await open(LIVE)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/workshop')
    expect(response.headers.getSetCookie()).toEqual([])
    expectUncachedAndNoReferrer(response)
    expect(reads().sanity).toEqual([])
  })

  it('forwards to the portal page when the main host cannot sign in either', async () => {
    h.getDomainClaim.mockResolvedValue(null)

    const response = await open(LIVE, SECONDARY)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('/workshop')
    expect(response.headers.getSetCookie()).toEqual([])
    expect(reads().sanity).toEqual([])
  })

  it('sets nothing when the host has changed hands since the conference was cached', async () => {
    h.getDomainClaim.mockImplementation(
      claimsById(provenClaim(MAIN, {}, { _id: 'conf-b' })),
    )

    const response = await open(LIVE)

    expect(response.headers.get('location')).toBe('/workshop')
    expect(response.headers.getSetCookie()).toEqual([])
    expect(reads().sanity).toEqual([])
  })
})

describe('the reads the route makes', () => {
  it('are the same whatever the token: the host decision and one read of the links', async () => {
    const perToken = []
    for (const token of [NEVER_EXISTED, 'x', LIVE, REVOKED, 'a'.repeat(500)]) {
      vi.clearAllMocks()
      store().reset(DATASET)
      await open(token)
      perToken.push(reads())
    }

    expect(perToken[0]).toEqual({
      // The live read that says whether this host can sign in.
      hostDecision: [`domainVerification.${MAIN}`],
      // The conference's links, by the conference alone, from Sanity's origin.
      sanity: [
        {
          client: 'uncached',
          query: expect.stringContaining('defined(workshopEarlyAccessToken)'),
          params: { conferenceId: CONF },
        },
      ],
    })
    for (const made of perToken) expect(made).toEqual(perToken[0])
  })
})

describe('no link token reaches the browser', () => {
  it('a live link sends its own token in the cookie and no other', async () => {
    const response = await open(LIVE)
    const sent = await sentText(response)
    // `NextResponse` mirrors a cookie it sets in a header of its own.
    const cookieHeaders = ['set-cookie', 'x-middleware-set-cookie']
    const { headers, ...rest } = await everythingSent(response)
    const outsideTheCookie = JSON.stringify({
      ...rest,
      headers: headers.filter(([name]) => !cookieHeaders.includes(name)),
    })

    expect(headers.filter(([name]) => cookieHeaders.includes(name))).toEqual(
      cookieHeaders.map((name) => [
        name,
        expect.stringContaining(`${COOKIE}=${LIVE};`),
      ]),
    )
    expect(outsideTheCookie).not.toContain(LIVE)
    for (const other of EVERY_TOKEN.filter((token) => token !== LIVE)) {
      expect(sent).not.toContain(other)
    }
  })

  it('a link that is not live sends no token at all', async () => {
    const sent = await sentText(await open(NEVER_EXISTED))

    for (const token of [...EVERY_TOKEN, NEVER_EXISTED]) {
      expect(sent).not.toContain(token)
    }
  })

  it('the forward to the main host carries the token it was asked with and no other', async () => {
    const sent = await sentText(await open(NEVER_EXISTED, SECONDARY))

    expect(sent.split(NEVER_EXISTED)).toHaveLength(2)
    for (const token of EVERY_TOKEN) expect(sent).not.toContain(token)
  })
})
