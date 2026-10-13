/**
 * @vitest-environment node
 *
 * EARLY ACCESS at `workshop.signup` (#1346, spec
 * `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §6), through the tRPC caller.
 *
 * REAL: the router, the access decision, the window rule, the link lookup and
 * the workshop data layer, with their query text (`groq-js`) and their writes
 * (`@sanity/mutator`). A sign-up is asserted on the STORED document.
 * SUPPLIED: the conference the request resolves to, the ticket provider, the
 * confirmation email and `next/cache`. The clock is pinned.
 * MODELLED: that a delete is refused while a strong reference remains
 * (`__tests__/helpers/versionedSanityStore.ts`).
 *
 * Every refusal for the window is paired with the IDENTICAL request carrying a
 * live cookie, which succeeds: the refusal comes from the window and from
 * nothing else on the way.
 */
import '../../helpers/workosEnv'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { stubPlatformTicketingAccount } from '../../helpers/ticketingSecrets'
import { createWorkshopCaller } from '../../helpers/trpc'
import type { VersionedSanityStore } from '../../helpers/versionedSanityStore'

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  /** The registration times of the conference this request resolves to. */
  times: {} as Record<string, string | null | undefined>,
}))

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(async () => ({
    conference: {
      _id: 'conf-1',
      title: 'CNDN',
      organization: { _type: 'reference', _ref: 'org-test' },
      ...h.times,
    },
    domain: 'cndn.no',
    error: null,
  })),
}))

vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: vi.fn(async () => ({
    _id: 'org-test',
    name: 'Platform',
    slug: 'platform-org',
    plan: 'pro',
  })),
  getOrganizationRefForCurrentConference: vi.fn(async () => 'org-test'),
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})

const ticketing = vi.hoisted(() => ({
  fetchEventTickets: vi.fn(),
  resolve: vi.fn(),
}))
vi.mock('@/lib/tickets/provider', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/tickets/provider')>()),
  resolveTicketingProvider: ticketing.resolve,
}))

vi.mock('@/lib/email/workshop', () => ({
  sendBasicWorkshopConfirmation: vi.fn(async () => {}),
}))

import { __resetRedeemedCache } from '@/lib/tickets/speakerStatus'
import { deleteSponsorForConference } from '@/lib/sponsor-crm/sanity'
import { revokeEarlyAccessLink } from '@/lib/workshop/early-access'

const store = () => h.store!
const CONF = 'conf-1'
const SFC = 'sfc-acme'
const COOKIE = '__Host-workshop-early-access'

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

const OPENS_OFFICIALLY = {
  refused: {
    code: 'PRECONDITION_FAILED',
    message: 'Workshop registration opens on Monday, June 15, 2026 at 12:30 AM',
  },
}
const OPENS_FOR_SPONSORS = {
  refused: {
    code: 'PRECONDITION_FAILED',
    message: 'Workshop registration opens on Friday, June 12, 2026 at 9:00 AM',
  },
}

const LIVE = '4b1c9d2e-7a55-4f0a-9c3e-1f2a3b4c5d6e'
const REVOKED = '9f8e7d6c-5b4a-4321-8fed-cba987654321'
const OTHER_CONFERENCE = '11111111-2222-4333-8444-555555555555'
const MADE_UP = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const sponsor = (
  id: string,
  token: string | undefined,
  conferenceId = CONF,
) => ({
  _id: id,
  _type: 'sponsorForConference',
  _rev: 'r0',
  conference: ref(conferenceId),
  sponsor: ref('sponsor-acme'),
  status: 'closed-won',
  ...(token && { workshopEarlyAccessToken: token }),
})

const workshop = (capacity: number) => ({
  _id: 'workshop-1',
  _type: 'talk',
  title: 'Kubernetes 101',
  format: 'workshop_120',
  conference: ref(CONF),
  capacity,
})
/** Someone else's confirmed seat in the workshop. */
const seatTaken = {
  _id: 'signup-other',
  _type: 'workshopSignup',
  userWorkOSId: 'workos-user-2',
  workshop: ref('workshop-1'),
  conference: ref(CONF),
  status: 'confirmed',
}

const DATASET = [
  { _id: CONF, _type: 'conference', title: 'CNDN' },
  { _id: 'sponsor-acme', _type: 'sponsor', name: 'Acme AS' },
  workshop(10),
  sponsor(SFC, LIVE),
  // Revoked: the published document holds no token, a draft still does.
  sponsor('sfc-revoked', undefined),
  sponsor('drafts.sfc-revoked', REVOKED),
  sponsor('sfc-elsewhere', OTHER_CONFERENCE, 'conf-b'),
]

const signupInput = {
  experienceLevel: 'beginner' as const,
  operatingSystem: 'linux' as const,
  workshop: { _type: 'reference' as const, _ref: 'workshop-1' },
}

/** The request, carrying the early-access cookie when `token` is given. */
function request(token?: string) {
  return new NextRequest('https://cndn.no/api/trpc/workshop.signup', {
    method: 'POST',
    headers: token ? { cookie: `${COOKIE}=${token}` } : {},
  })
}

/** The caller's own sign-ups, as stored. */
const mySignups = () =>
  store()
    .all()
    .filter(
      (doc) =>
        doc._type === 'workshopSignup' && doc.userWorkOSId === 'workos-user-1',
    )

/** The outcome of one sign-up attempt, as a value: what was STORED, or the refusal. */
async function attempt(token?: string) {
  const before = mySignups().length
  try {
    await createWorkshopCaller(undefined, request(token)).workshop.signup(
      signupInput,
    )
  } catch (error) {
    const { code, message } = error as { code: string; message: string }
    // A refusal stores nothing.
    expect(mySignups()).toHaveLength(before)
    return { refused: { code, message } }
  }
  const [stored] = mySignups().slice(before)
  return {
    stored: {
      status: stored.status,
      workshop: (stored.workshop as { _ref: string })._ref,
      // `undefined` when the sign-up records no sponsor.
      earlyAccessSponsor: stored.earlyAccessSponsor,
    },
  }
}

/** The live lookups of a link that ran: the token each one asked for. */
const linkLookups = () =>
  store()
    .reads.filter((read) => 'linkToken' in read.params)
    .map((read) => read.params.linkToken)

const EARLY = (status = 'confirmed') => ({
  stored: {
    status,
    workshop: 'workshop-1',
    earlyAccessSponsor: { _type: 'reference', _ref: SFC, _weak: true },
  },
})
const ORDINARY = {
  stored: {
    status: 'confirmed',
    workshop: 'workshop-1',
    earlyAccessSponsor: undefined,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) })
  __resetRedeemedCache()
  store().reset(DATASET)
  h.times = INSIDE_THE_WINDOW
  ticketing.fetchEventTickets.mockResolvedValue([
    {
      id: 1,
      order_id: 1,
      category: 'Workshop + Conference (2 days)',
      crm: { email: 'attendee@example.com' },
    },
  ])
  ticketing.resolve.mockResolvedValue({
    configured: true,
    provider: { fetchEventTickets: ticketing.fetchEventTickets },
    eventRef: { customerId: 1, eventId: 2 },
  })
  vi.stubEnv('PLATFORM_ORG_ID', 'org-test')
  stubPlatformTicketingAccount()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('inside the early-access window', () => {
  it('a person with a workshop ticket and a live cookie signs up, and the sign-up records the sponsor', async () => {
    expect(await attempt(LIVE)).toEqual(EARLY())
    expect(linkLookups()).toEqual([LIVE])
  })

  it('the same request without the cookie is told the official opening', async () => {
    expect(await attempt()).toEqual(OPENS_OFFICIALLY)
    expect(linkLookups()).toEqual([])
    // The identical request with a live cookie signs up.
    expect(await attempt(LIVE)).toEqual(EARLY())
  })

  it.each([
    ['a cookie whose link was revoked', REVOKED],
    ['a cookie that was made up', MADE_UP],
    ["a cookie of another conference's link", OTHER_CONFERENCE],
  ])('%s is told the official opening', async (_case, token) => {
    expect(await attempt(token)).toEqual(OPENS_OFFICIALLY)
    expect(await attempt(LIVE)).toEqual(EARLY())
  })

  it('a full workshop gives a waitlisted sign-up with the sponsor recorded', async () => {
    store().reset([
      ...DATASET.filter((doc) => doc._id !== 'workshop-1'),
      workshop(1),
      seatTaken,
    ])

    expect(await attempt(LIVE)).toEqual(EARLY('waitlist'))
  })

  it('a sign-up that had passed the lookup when a revoke landed goes through', async () => {
    // The revoke lands just before the sign-up is written.
    store().beforeNextCommit(() => revokeEarlyAccessLink(CONF, SFC))

    expect(await attempt(LIVE)).toEqual(EARLY())
    expect(store().doc(SFC)?.workshopEarlyAccessToken).toBeUndefined()
    // The next attempt is refused: the link is no longer live.
    store().reset([
      ...DATASET.filter((doc) => doc._id !== SFC),
      sponsor(SFC, undefined),
    ])
    expect(await attempt(LIVE)).toEqual(OPENS_OFFICIALLY)
  })
})

describe('before the sponsor start time', () => {
  beforeEach(() => {
    h.times = {
      ...INSIDE_THE_WINDOW,
      workshopRegistrationSponsorStart: SPONSOR_START_AHEAD,
    }
  })

  it('a live cookie is told the sponsor start time, and everyone else the official opening', async () => {
    expect(await attempt(LIVE)).toEqual(OPENS_FOR_SPONSORS)
    expect(await attempt()).toEqual(OPENS_OFFICIALLY)
    expect(await attempt(REVOKED)).toEqual(OPENS_OFFICIALLY)
  })

  it('the identical request signs up once the sponsor start time has come', async () => {
    expect(await attempt(LIVE)).toEqual(OPENS_FOR_SPONSORS)

    vi.setSystemTime(new Date(SPONSOR_START_AHEAD))

    expect(await attempt(LIVE)).toEqual(EARLY())
  })
})

describe('when early access cannot matter, the link is never looked up', () => {
  it('after the official opening a live cookie signs up, and no sponsor is recorded', async () => {
    vi.setSystemTime(new Date(OFFICIAL_OPENING))

    expect(await attempt(LIVE)).toEqual(ORDINARY)
    expect(linkLookups()).toEqual([])
  })

  it('a conference with no sponsor start time: a live cookie is told the official opening', async () => {
    h.times = {
      workshopRegistrationStart: OFFICIAL_OPENING,
      workshopRegistrationEnd: END,
    }

    expect(await attempt(LIVE)).toEqual(OPENS_OFFICIALLY)
    expect(linkLookups()).toEqual([])
  })

  it('after the end, a live cookie is told sign-up has closed', async () => {
    h.times = {
      workshopRegistrationSponsorStart: '2026-05-01T07:00:00.000Z',
      workshopRegistrationStart: '2026-07-01T07:00:00.000Z',
      workshopRegistrationEnd: '2026-06-01T07:00:00.000Z',
    }

    expect(await attempt(LIVE)).toEqual({
      refused: {
        code: 'PRECONDITION_FAILED',
        message: 'Workshop registration has closed',
      },
    })
    expect(linkLookups()).toEqual([])
  })

  it('a caller without a workshop ticket is refused as without the cookie', async () => {
    ticketing.fetchEventTickets.mockResolvedValue([])
    const withoutCookie = await attempt()
    __resetRedeemedCache()

    const withCookie = await attempt(LIVE)

    expect(withCookie.refused?.code).toBe('FORBIDDEN')
    expect(withCookie).toEqual(withoutCookie)
    expect(linkLookups()).toEqual([])
    // The same request from a person with a workshop ticket signs up.
    ticketing.fetchEventTickets.mockResolvedValue([
      {
        id: 1,
        order_id: 1,
        category: 'Workshop + Conference (2 days)',
        crm: { email: 'attendee@example.com' },
      },
    ])
    __resetRedeemedCache()
    expect(await attempt(LIVE)).toEqual(EARLY())
  })
})

describe('the recorded sponsor is a weak reference', () => {
  it('a sponsor with early sign-ups can be removed from the conference', async () => {
    expect(await attempt(LIVE)).toEqual(EARLY())

    expect(await deleteSponsorForConference(SFC)).toEqual({})

    expect(store().doc(SFC)).toBeUndefined()
    // The sign-up stays, still saying which sponsor's link it was.
    expect(mySignups()[0].earlyAccessSponsor).toEqual({
      _type: 'reference',
      _ref: SFC,
      _weak: true,
    })
  })

  it('the same reference stored strong would keep the sponsor from being removed', async () => {
    await attempt(LIVE)
    const [signup] = mySignups()
    store().put({
      ...signup,
      earlyAccessSponsor: { _type: 'reference', _ref: SFC },
    })

    const { error } = await deleteSponsorForConference(SFC)

    expect(error?.message).toContain('is still referenced')
    expect(store().doc(SFC)).toBeDefined()
  })
})
