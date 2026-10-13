/**
 * @vitest-environment node
 *
 * WHAT ORGANIZERS SEE OF EARLY SIGN-UPS (#1348, spec
 * `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §9), through the tRPC caller:
 * the sponsor on a sign-up's row in the dialog (`workshop.admin.listSignups`,
 * and `workshop.admin.getAllSignups` until that answer arrives) and the list
 * of every early sign-up (`workshop.admin.listEarlySignups`).
 *
 * REAL: the procedures, the organizer and feature gates, and the data layer
 * with its query text, run through `groq-js` over the documents below.
 * SUPPLIED: the conference the request resolves to, the workshop feature
 * decision and `next/cache`.
 * MODELLED: see `__tests__/helpers/versionedSanityStore.ts`.
 *
 * Expected values are literals of the fixture, never computed the way the
 * queries compute them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))

const h = vi.hoisted(() => ({
  store: null as null | VersionedSanityStore,
  getConference: vi.fn(),
  workshopsEnabled: vi.fn<(c: unknown) => Promise<boolean>>(),
}))

vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store = createVersionedSanityStore()
  return h.store.clients
})
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: h.workshopsEnabled,
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

import type { Context } from '@/server/trpc'
import { WorkshopSignupStatus } from '@/lib/workshop/types'
import { workshopRouter } from './workshop'

const t = initTRPC.context<Context>().create()
const ORG = 'org-a'
const CONF = 'conf-a'
const OTHER_CONF = 'conf-b'
const WORKSHOP = 'ws-k8s'

const store = () => h.store!
const ref = (id: string) => ({ _type: 'reference', _ref: id })
const weakRef = (id: string) => ({ ...ref(id), _weak: true })

const sponsorOfConference = (id: string, conf: string, sponsor: string) => ({
  _id: id,
  _type: 'sponsorForConference',
  conference: ref(conf),
  sponsor: ref(sponsor),
  status: 'closed-won',
})

function signup(
  id: string,
  {
    conf = CONF,
    workshop = WORKSHOP,
    status = 'confirmed',
    via,
    at = '2026-06-09T08:00:00Z',
    ...rest
  }: {
    conf?: string
    workshop?: string
    status?: string
    /** The `sponsorForConference` whose link admitted this sign-up. */
    via?: string
    at?: string
  } & Record<string, unknown> = {},
) {
  return {
    _id: id,
    _type: 'workshopSignup',
    _createdAt: at,
    _updatedAt: at,
    userName: `Person ${id}`,
    userEmail: `${id}@example.com`,
    userWorkOSId: `workos-${id}`,
    experienceLevel: 'beginner',
    operatingSystem: 'linux',
    workshop: ref(workshop),
    conference: ref(conf),
    status,
    signedUpAt: at,
    ...(via && { earlyAccessSponsor: weakRef(via) }),
    ...rest,
  }
}

const BASE = [
  { _id: CONF, _type: 'conference', name: 'Conf A', organization: ref(ORG) },
  {
    _id: OTHER_CONF,
    _type: 'conference',
    name: 'Conf B',
    organization: ref('org-b'),
  },
  { _id: 'sponsor-acme', _type: 'sponsor', name: 'Acme AS' },
  { _id: 'sponsor-globex', _type: 'sponsor', name: 'Globex' },
  { _id: 'sponsor-initech', _type: 'sponsor', name: 'Initech' },
  sponsorOfConference('sfc-acme', CONF, 'sponsor-acme'),
  sponsorOfConference('sfc-globex', CONF, 'sponsor-globex'),
  // A sponsor of ANOTHER conference.
  sponsorOfConference('sfc-theirs', OTHER_CONF, 'sponsor-initech'),
  {
    _id: WORKSHOP,
    _type: 'talk',
    title: 'Kubernetes 101',
    format: 'workshop_120',
    conference: ref(CONF),
    date: '2026-10-20',
    startTime: '09:00',
    endTime: '11:00',
    capacity: 30,
  },
  {
    _id: 'ws-theirs',
    _type: 'talk',
    title: 'Their workshop',
    format: 'workshop_120',
    conference: ref(OTHER_CONF),
  },
]

/**
 * The sign-ups of the dialog's fixture, newest first as the dialog reads
 * them. `su-gone` names a sponsor that was removed from the conference: no
 * such document. `su-foreign` names a sponsor of another conference, which
 * only a bad write can produce.
 */
const DIALOG = [
  signup('su-ada', { via: 'sfc-acme', at: '2026-06-09T08:05:00Z' }),
  signup('su-bob', { at: '2026-06-09T08:04:00Z' }),
  signup('su-gone', { via: 'sfc-removed', at: '2026-06-09T08:03:00Z' }),
  signup('su-foreign', { via: 'sfc-theirs', at: '2026-06-09T08:02:00Z' }),
  signup('su-wait', {
    via: 'sfc-globex',
    status: 'waitlist',
    at: '2026-06-09T08:01:00Z',
  }),
  // ANOTHER CONFERENCE'S sign-ups. The second points at this conference's
  // workshop and this conference's sponsor: only its `conference` says whose
  // it is.
  signup('su-theirs', {
    conf: OTHER_CONF,
    workshop: 'ws-theirs',
    via: 'sfc-theirs',
  }),
  signup('su-theirs-crossed', { conf: OTHER_CONF, via: 'sfc-acme' }),
]

function caller(organizerOf: string = ORG) {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: [organizerOf],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return t.createCallerFactory(workshopRouter)({
    req: { headers: new Headers(), url: 'https://conf.example.org' },
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}

beforeEach(() => {
  vi.clearAllMocks()
  store().reset([...BASE, ...DIALOG])
  h.getConference.mockResolvedValue({
    conference: { _id: CONF, organization: { _ref: ORG } },
    domain: 'conf.example.org',
    error: null,
  })
  h.workshopsEnabled.mockResolvedValue(true)
})

describe("a sign-up's row in the dialog (workshop.admin.listSignups)", () => {
  it("carries the sponsor's name on an early sign-up, and nothing on any other", async () => {
    const { data } = await caller().admin.listSignups({
      workshopId: WORKSHOP,
      status: WorkshopSignupStatus.CONFIRMED,
    })

    expect(data.map((row) => [row._id, row.earlyAccess])).toEqual([
      ['su-ada', { sponsor: { _id: 'sfc-acme', name: 'Acme AS' } }],
      ['su-bob', null],
      // The sponsor was removed from the conference: early, and no name.
      ['su-gone', { sponsor: null }],
      // A sponsor of another conference is never read by name.
      ['su-foreign', { sponsor: null }],
    ])
  })

  it('still carries every field the dialog read before', async () => {
    const { data } = await caller().admin.listSignups({
      workshopId: WORKSHOP,
      status: WorkshopSignupStatus.WAITLIST,
    })

    expect(data).toEqual([
      {
        _id: 'su-wait',
        _type: 'workshopSignup',
        userEmail: 'su-wait@example.com',
        userName: 'Person su-wait',
        userWorkOSId: 'workos-su-wait',
        experienceLevel: 'beginner',
        operatingSystem: 'linux',
        workshop: {
          _id: WORKSHOP,
          title: 'Kubernetes 101',
          date: '2026-10-20',
          startTime: '09:00',
          endTime: '11:00',
          capacity: 30,
        },
        conference: { _id: CONF, name: 'Conf A' },
        status: 'waitlist',
        signedUpAt: '2026-06-09T08:01:00Z',
        notes: null,
        _createdAt: '2026-06-09T08:01:00Z',
        _updatedAt: '2026-06-09T08:01:00Z',
        earlyAccess: { sponsor: { _id: 'sfc-globex', name: 'Globex' } },
      },
    ])
  })

  it("leaves another conference's sign-ups out, also one that points at this workshop", async () => {
    const { data } = await caller().admin.listSignups({ workshopId: WORKSHOP })

    expect(data.map((row) => row._id)).toEqual([
      'su-ada',
      'su-bob',
      'su-gone',
      'su-foreign',
      'su-wait',
    ])
  })
})

describe("the page's general read of sign-ups (workshop.admin.getAllSignups)", () => {
  it("carries the sponsor's name on an early sign-up, and nothing on any other", async () => {
    const { data } = await caller().admin.getAllSignups({ pageSize: 100 })

    expect(data.map((row) => [row._id, row.earlyAccess])).toEqual([
      ['su-ada', { sponsor: { _id: 'sfc-acme', name: 'Acme AS' } }],
      ['su-bob', null],
      ['su-gone', { sponsor: null }],
      ['su-foreign', { sponsor: null }],
      ['su-wait', { sponsor: { _id: 'sfc-globex', name: 'Globex' } }],
    ])
  })

  it('still carries every field the page read before', async () => {
    const { data } = await caller().admin.getAllSignups({ pageSize: 100 })

    expect(data.find((row) => row._id === 'su-bob')).toEqual({
      _id: 'su-bob',
      _type: 'workshopSignup',
      userEmail: 'su-bob@example.com',
      userName: 'Person su-bob',
      userWorkOSId: 'workos-su-bob',
      workshop: {
        _id: WORKSHOP,
        _ref: null,
        title: 'Kubernetes 101',
        date: '2026-10-20',
        startTime: '09:00',
        endTime: '11:00',
        capacity: 30,
      },
      conference: { _id: CONF, _ref: null, name: 'Conf A' },
      status: 'confirmed',
      signedUpAt: '2026-06-09T08:04:00Z',
      notes: null,
      _createdAt: '2026-06-09T08:04:00Z',
      _updatedAt: '2026-06-09T08:04:00Z',
      earlyAccess: null,
    })
  })
})

/**
 * THE LIST'S FIXTURE: 120 ordinary sign-ups made after the official opening,
 * and the early ones, which are older. The page's general read takes the
 * newest hundred, so every early sign-up lies beyond it.
 */
const ORDINARY = Array.from({ length: 120 }, (_, n) =>
  signup(`su-public-${String(n).padStart(3, '0')}`, {
    at: `2026-06-15T10:${String(n % 60).padStart(2, '0')}:${String(Math.floor(n / 60)).padStart(2, '0')}Z`,
  }),
)
const LIST = [
  ...ORDINARY,
  signup('su-ada', { via: 'sfc-acme', at: '2026-06-09T08:05:00Z' }),
  signup('su-bea', {
    via: 'sfc-acme',
    status: 'waitlist',
    at: '2026-06-09T08:04:00Z',
  }),
  signup('su-gone', { via: 'sfc-removed', at: '2026-06-09T08:03:00Z' }),
  signup('su-foreign', { via: 'sfc-theirs', at: '2026-06-09T08:02:00Z' }),
  signup('su-gus', { via: 'sfc-globex', at: '2026-06-09T08:01:00Z' }),
  // Neither a seat nor a place in line: no sign-up is stored like this today.
  // Through a sponsor nobody else signed up through.
  signup('su-void', {
    via: 'sfc-quiet',
    status: 'cancelled',
    at: '2026-06-09T08:00:30Z',
  }),
  // A sponsor of this conference that nobody signed up through.
  sponsorOfConference('sfc-quiet', CONF, 'sponsor-quiet'),
  { _id: 'sponsor-quiet', _type: 'sponsor', name: 'Quiet Corp' },
  // ANOTHER CONFERENCE: a second sponsor there, and sign-ups through both.
  sponsorOfConference('sfc-theirs-other', OTHER_CONF, 'sponsor-initech'),
  signup('su-theirs', {
    conf: OTHER_CONF,
    workshop: 'ws-theirs',
    via: 'sfc-theirs',
  }),
  signup('su-theirs-other', {
    conf: OTHER_CONF,
    workshop: 'ws-theirs',
    via: 'sfc-theirs-other',
  }),
  // Theirs, through a sponsor of THIS conference that none of ours used.
  signup('su-theirs-quiet', { conf: OTHER_CONF, via: 'sfc-quiet' }),
  // Theirs, pointing at this conference's workshop and sponsor.
  signup('su-theirs-crossed', { conf: OTHER_CONF, via: 'sfc-acme' }),
]

const K8S = { _id: WORKSHOP, title: 'Kubernetes 101' }
const ACME = { _id: 'sfc-acme', name: 'Acme AS' }
const GLOBEX = { _id: 'sfc-globex', name: 'Globex' }
const ADA = {
  _id: 'su-ada',
  userName: 'Person su-ada',
  userEmail: 'su-ada@example.com',
  status: 'confirmed',
  signedUpAt: '2026-06-09T08:05:00Z',
  workshop: K8S,
  earlyAccess: { sponsor: ACME },
}
const BEA = {
  _id: 'su-bea',
  userName: 'Person su-bea',
  userEmail: 'su-bea@example.com',
  status: 'waitlist',
  signedUpAt: '2026-06-09T08:04:00Z',
  workshop: K8S,
  earlyAccess: { sponsor: ACME },
}
const GONE = {
  _id: 'su-gone',
  userName: 'Person su-gone',
  userEmail: 'su-gone@example.com',
  status: 'confirmed',
  signedUpAt: '2026-06-09T08:03:00Z',
  workshop: K8S,
  earlyAccess: { sponsor: null },
}
const FOREIGN = {
  _id: 'su-foreign',
  userName: 'Person su-foreign',
  userEmail: 'su-foreign@example.com',
  status: 'confirmed',
  signedUpAt: '2026-06-09T08:02:00Z',
  workshop: K8S,
  earlyAccess: { sponsor: null },
}
const GUS = {
  _id: 'su-gus',
  userName: 'Person su-gus',
  userEmail: 'su-gus@example.com',
  status: 'confirmed',
  signedUpAt: '2026-06-09T08:01:00Z',
  workshop: K8S,
  earlyAccess: { sponsor: GLOBEX },
}

describe('the list of early sign-ups (workshop.admin.listEarlySignups)', () => {
  beforeEach(() => {
    store().reset([...BASE, ...LIST])
  })

  it('holds every early sign-up of the conference and no other, also those beyond the first hundred sign-ups', async () => {
    // The premise: the page's general read ends before the first early one.
    const general = await caller().admin.getAllSignups({ pageSize: 100 })
    expect(general.data).toHaveLength(100)
    expect(general.data.filter((row) => row.earlyAccess)).toEqual([])

    const { signups } = await caller().admin.listEarlySignups({})

    expect(signups).toEqual([ADA, BEA, GONE, FOREIGN, GUS])
  })

  it('offers, for narrowing, the sponsors of this conference that an early sign-up names', async () => {
    const { sponsors } = await caller().admin.listEarlySignups({})

    // Not the removed one, not another conference's, not one without sign-ups.
    expect(sponsors).toEqual([ACME, GLOBEX])
  })

  it('narrowed to one sponsor, holds that sponsor’s early sign-ups only', async () => {
    expect(
      await caller().admin.listEarlySignups({ sponsorId: 'sfc-acme' }),
    ).toEqual({ signups: [ADA, BEA], sponsors: [ACME, GLOBEX] })
    expect(
      (await caller().admin.listEarlySignups({ sponsorId: 'sfc-globex' }))
        .signups,
    ).toEqual([GUS])
  })

  it('narrowed to a sponsor of this conference without sign-ups, is empty and still names that sponsor', async () => {
    expect(
      await caller().admin.listEarlySignups({ sponsorId: 'sfc-quiet' }),
    ).toEqual({
      signups: [],
      sponsors: [ACME, GLOBEX, { _id: 'sfc-quiet', name: 'Quiet Corp' }],
    })
  })

  it("answers another conference's sponsor exactly as an id that does not exist", async () => {
    const foreign = await caller().admin.listEarlySignups({
      sponsorId: 'sfc-theirs-other',
    })
    const missing = await caller().admin.listEarlySignups({
      sponsorId: 'sfc-nobody',
    })

    expect(foreign).toEqual({ signups: [], sponsors: [ACME, GLOBEX] })
    expect(missing).toEqual({ signups: [], sponsors: [ACME, GLOBEX] })
  })

  it('reads every match: 130 early sign-ups through one sponsor are 130 rows', async () => {
    store().reset([
      ...BASE,
      ...Array.from({ length: 130 }, (_, n) =>
        signup(`su-many-${n}`, { via: 'sfc-globex' }),
      ),
    ])

    const { signups } = await caller().admin.listEarlySignups({
      sponsorId: 'sfc-globex',
    })

    expect(signups).toHaveLength(130)
    expect(new Set(signups.map((row) => row._id)).size).toBe(130)
  })

  it('makes one read', async () => {
    await caller().admin.listEarlySignups({ sponsorId: 'sfc-acme' })

    expect(store().reads).toHaveLength(1)
  })

  // `createWorkshopSignup` stores no `signedUpAt` today.
  it('places a sign-up stored without `signedUpAt` by when it was created, and answers that time', async () => {
    store().put({
      ...signup('su-new', { via: 'sfc-globex', at: '2026-06-09T08:04:30Z' }),
      signedUpAt: undefined,
    })

    const { signups } = await caller().admin.listEarlySignups({})

    expect(signups.map((row) => [row._id, row.signedUpAt])).toEqual([
      ['su-ada', '2026-06-09T08:05:00Z'],
      ['su-new', '2026-06-09T08:04:30Z'],
      ['su-bea', '2026-06-09T08:04:00Z'],
      ['su-gone', '2026-06-09T08:03:00Z'],
      ['su-foreign', '2026-06-09T08:02:00Z'],
      ['su-gus', '2026-06-09T08:01:00Z'],
    ])
  })

  it('follows the sign-up: gone when it is deleted, kept when it is moved to the waitlist', async () => {
    const { moveWorkshopSignupToWaitlist } =
      await import('@/lib/workshop/sanity')
    // A cancel and an organizer's delete remove the document.
    store().reset(
      [...BASE, ...LIST].filter((document) => document._id !== 'su-ada'),
    )
    await moveWorkshopSignupToWaitlist('su-gus')

    const { signups } = await caller().admin.listEarlySignups({})

    expect(signups.map((row) => [row._id, row.status])).toEqual([
      ['su-bea', 'waitlist'],
      ['su-gone', 'confirmed'],
      ['su-foreign', 'confirmed'],
      ['su-gus', 'waitlist'],
    ])
  })

  describe('is refused before anything is read', () => {
    it('for a caller who is not an organizer of this organization', async () => {
      await expect(
        caller('org-b').admin.listEarlySignups({ sponsorId: 'sfc-acme' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
      expect(store().reads).toEqual([])
    })

    it('when the conference has no workshops', async () => {
      h.workshopsEnabled.mockResolvedValue(false)

      await expect(caller().admin.listEarlySignups({})).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
      expect(store().reads).toEqual([])
    })

    it.each([[''], ['x'.repeat(201)]])(
      'for a sponsor id that is not one (%j)',
      async (sponsorId) => {
        await expect(
          caller().admin.listEarlySignups({ sponsorId }),
        ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
        expect(store().reads).toEqual([])
      },
    )

    // The identical requests are answered once the gate lets them through.
    it('and the same requests are answered for an organizer with workshops', async () => {
      expect(
        (await caller().admin.listEarlySignups({ sponsorId: 'sfc-acme' }))
          .signups,
      ).toEqual([ADA, BEA])
    })
  })
})

describe('listEarlySignups, the read itself', () => {
  it('reads nothing and answers nothing for a conference that could not be resolved', async () => {
    const { listEarlySignups } = await import('@/lib/workshop/early-access')
    store().reset([...BASE, ...LIST])

    expect(await listEarlySignups('', 'sfc-acme')).toEqual({
      signups: [],
      sponsors: [],
    })
    expect(store().reads).toEqual([])
    // The identical call for the conference answers its sign-ups.
    expect(
      (await listEarlySignups(CONF, 'sfc-acme')).signups.map((row) => row._id),
    ).toEqual(['su-ada', 'su-bea'])
  })
})
