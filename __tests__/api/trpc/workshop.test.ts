/**
 * @vitest-environment node
 *
 * Router-level tests for the PUBLIC workshop procedures (src/server/routers/
 * workshop.ts) that were the subject of the signup-authorization fix:
 * - `signup` binds the created doc to the WorkOS session identity and IGNORES
 *   any identity a client tries to smuggle in;
 * - `signup`/`cancelSignup` reject with UNAUTHORIZED when there is no WorkOS
 *   session;
 * - `cancelSignup` may only cancel the caller's OWN signup (ownership check);
 * - `getMySignups` is scoped to the session identity, never client input;
 * - admin procedures remain gated by the NextAuth organizer session and are not
 *   reachable via a WorkOS attendee session;
 * - every attendee procedure enforces the portal access decision (#1294): a
 *   WorkOS session alone is not enough.
 *
 * The workshop data layer is mocked (IO only); the router's authz logic runs for
 * real. Callers are built with the WorkOS-attendee / anonymous / admin helpers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createWorkshopCaller,
  createAnonymousCaller,
  createAdminCaller,
} from '../../helpers/trpc'

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(async () => ({
    conference: {
      _id: 'conf-1',
      title: 'CNDN',
      // The admin waist derives the REQUEST's org from this conference and grants
      // only when the caller's `organizerOrgIds` contains it — so the domain
      // conference must point at the fixture organizer's org (TEST_ORG_ID).
      // It is ALSO the owning tenant the `workshops` feature gate (#689)
      // resolves from, so the org document mocked below carries the same id.
      organization: { _type: 'reference', _ref: 'org-test' },
      workshopRegistrationStart: null,
      workshopRegistrationEnd: null,
    },
    domain: 'cndn.no',
    error: null,
  })),
}))

// The org that owns the conference IS the platform org, so it keeps the
// `workshops` feature — the state the admin procedures ran in before the gate.
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: vi.fn(async () => ({
    _id: 'org-test',
    name: 'Platform',
    slug: 'platform-org',
  })),
  getOrganizationRefForCurrentConference: vi.fn(async () => 'org-test'),
}))

/**
 * The platform-org grant is an ID comparison against the configured
 * `PLATFORM_ORG_ID` (RunKonf/platform#43) — pure env, no Sanity read and never
 * the cached org document's `slug`. This mock is a TRIPWIRE: a reintroduced slug
 * lookup would call it and trip the no-fetch guard.
 */
const h = vi.hoisted(() => ({ fetch: vi.fn(async () => null) }))

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: h.fetch },
}))

/**
 * `resolveTicketingProvider` is the mocked boundary, so credential and binding
 * resolution do NOT run here (a fixture conference needs no ticketing ids to be
 * "configured"). Everything above it is real: the ticket memo, the eligibility
 * rule and the access decision.
 */
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

vi.mock('@/lib/workshop/sanity', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/workshop/sanity')>()
  return {
    ...actual,
    getWorkshopSignups: vi.fn(async () => []),
    checkWorkshopCapacity: vi.fn(async () => ({
      available: 10,
      capacity: 10,
      signups: 0,
    })),
    verifyWorkshopBelongsToConference: vi.fn(async () => true),
    createWorkshopSignup: vi.fn(async (data) => ({
      _id: 'signup-1',
      _type: 'workshopSignup',
      status: data.status ?? 'confirmed',
      userEmail: data.userEmail,
      userName: data.userName,
      userWorkOSId: data.userWorkOSId,
      workshop: { _ref: data.workshop._ref, title: 'Kubernetes 101' },
      conference: { _ref: data.conference._ref },
    })),
    getAllWorkshopSignups: vi.fn(async () => []),
    cancelWorkshopSignup: vi.fn(async () => {}),
    getWorkshopStatistics: vi.fn(async () => ({
      workshops: [],
      totals: {
        totalWorkshops: 0,
        totalCapacity: 0,
        totalSignups: 0,
        uniqueParticipants: 0,
        totalConfirmed: 0,
        totalPending: 0,
        totalWaitlist: 0,
        totalCancelled: 0,
        averageUtilization: 0,
      },
    })),
  }
})

import {
  getWorkshopSignups,
  createWorkshopSignup,
  getAllWorkshopSignups,
  cancelWorkshopSignup,
  checkWorkshopCapacity,
  verifyWorkshopBelongsToConference,
} from '@/lib/workshop/sanity'
import { __resetRedeemedCache } from '@/lib/tickets/speakerStatus'

type LooseMock = ReturnType<typeof vi.fn>
const getSignupsMock = getWorkshopSignups as unknown as LooseMock
const createSignupMock = createWorkshopSignup as unknown as LooseMock
const getAllMock = getAllWorkshopSignups as unknown as LooseMock
const cancelMock = cancelWorkshopSignup as unknown as LooseMock
const capacityMock = checkWorkshopCapacity as unknown as LooseMock
const belongsMock = verifyWorkshopBelongsToConference as unknown as LooseMock

/** A legacy-bridge category that grants workshop access (no declared roles). */
const WORKSHOP_TICKET = 'Workshop + Conference (2 days)'
const ORDINARY_TICKET = 'Conference only'

function ticket(email: string, category = WORKSHOP_TICKET) {
  return { id: 1, order_id: 1, category, crm: { email } }
}

/** Every signup read and write an attendee procedure could reach. */
function expectNoSignupIO() {
  expect(getSignupsMock).not.toHaveBeenCalled()
  expect(getAllMock).not.toHaveBeenCalled()
  expect(belongsMock).not.toHaveBeenCalled()
  expect(capacityMock).not.toHaveBeenCalled()
  expect(createSignupMock).not.toHaveBeenCalled()
  expect(cancelMock).not.toHaveBeenCalled()
}

const workshopRef = { _type: 'reference' as const, _ref: 'workshop-1' }

// NOTE: no `conference` field — the schemas no longer accept one; the server
// always resolves the conference from the request domain.
const baseSignupInput = {
  experienceLevel: 'beginner' as const,
  operatingSystem: 'linux' as const,
  workshop: workshopRef,
}

beforeEach(() => {
  vi.clearAllMocks()
  // The ticket memo is process-global: without this a case inherits the
  // previous case's ticket list for 30 seconds.
  __resetRedeemedCache()
  // No live conference document unless a case supplies one (`clearAllMocks`
  // keeps implementations, so a case's override would otherwise leak).
  h.fetch.mockResolvedValue(null)
  // The default attendee of every case below holds a workshop ticket.
  ticketing.fetchEventTickets.mockResolvedValue([
    ticket('attendee@example.com'),
    ticket('real@example.com'),
  ])
  ticketing.resolve.mockResolvedValue({
    configured: true,
    provider: { fetchEventTickets: ticketing.fetchEventTickets },
    eventRef: { customerId: 1, eventId: 2 },
  })
  // Names the org above (`org-test`) as the platform org by its document id,
  // which is what grants `workshops` — a pure env comparison, no Sanity read.
  vi.stubEnv('PLATFORM_ORG_ID', 'org-test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('workshop.signup identity binding', () => {
  it('binds the signup to the WorkOS session id, not to client-sent identity', async () => {
    const caller = createWorkshopCaller({
      id: 'workos-real',
      email: 'real@example.com',
      firstName: 'Real',
      lastName: 'User',
    })

    // A malicious client tries to smuggle another person's identity in. The
    // input schema no longer declares these fields, so they are stripped; the
    // server binds to the session regardless.
    await caller.workshop.signup({
      ...baseSignupInput,
      userWorkOSId: 'victim-id',
      userEmail: 'victim@example.com',
      userName: 'Victim',
    } as unknown as typeof baseSignupInput)

    expect(createSignupMock).toHaveBeenCalledTimes(1)
    const written = createSignupMock.mock.calls[0][0]
    expect(written.userWorkOSId).toBe('workos-real')
    expect(written.userEmail).toBe('real@example.com')
    expect(written.userName).toBe('Real User')
    // The duplicate-check read is also scoped to the session id.
    expect(getSignupsMock).toHaveBeenCalledWith(
      'workos-real',
      'conf-1',
      undefined,
    )
  })

  it('binds the signup to the DOMAIN conference, ignoring a smuggled conference ref', async () => {
    const caller = createWorkshopCaller({
      id: 'workos-real',
      email: 'real@example.com',
    })

    // A malicious client tries to point the signup at another tenant's
    // conference. The schema no longer declares the field, so it is stripped;
    // the server writes the domain-resolved conference regardless.
    await caller.workshop.signup({
      ...baseSignupInput,
      conference: { _type: 'reference', _ref: 'evil-conf' },
    } as unknown as typeof baseSignupInput)

    expect(createSignupMock).toHaveBeenCalledTimes(1)
    const written = createSignupMock.mock.calls[0][0]
    expect(written.conference).toEqual({ _type: 'reference', _ref: 'conf-1' })
  })

  it('rejects signup with UNAUTHORIZED when there is no WorkOS session', async () => {
    const caller = createAnonymousCaller()
    await expect(caller.workshop.signup(baseSignupInput)).rejects.toThrow(
      /UNAUTHORIZED|signed in/,
    )
    expect(createSignupMock).not.toHaveBeenCalled()
  })
})

describe('workshop.cancelSignup ownership', () => {
  it('rejects cancel with UNAUTHORIZED when there is no WorkOS session', async () => {
    const caller = createAnonymousCaller()
    await expect(
      caller.workshop.cancelSignup({ signupId: 'signup-1' }),
    ).rejects.toThrow(/UNAUTHORIZED|signed in/)
    expect(cancelMock).not.toHaveBeenCalled()
  })

  it('returns NOT_FOUND when the signup does not exist', async () => {
    getAllMock.mockResolvedValueOnce([])
    const caller = createWorkshopCaller({ id: 'workos-real' })
    // The exact message: the access guard has its own NOT_FOUND ("Conference
    // not found"), which a looser match would accept in place of this one.
    await expect(
      caller.workshop.cancelSignup({ signupId: 'missing' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Signup not found' })
    expect(getAllMock).toHaveBeenCalledTimes(1)
    expect(cancelMock).not.toHaveBeenCalled()
  })

  it('forbids cancelling another attendee’s signup', async () => {
    getAllMock.mockResolvedValueOnce([
      { _id: 'signup-1', userWorkOSId: 'someone-else' },
    ])
    const caller = createWorkshopCaller({ id: 'workos-real' })
    // The exact message, and proof the ownership read ran: the access guard
    // also refuses with FORBIDDEN, so the code alone would prove nothing.
    await expect(
      caller.workshop.cancelSignup({ signupId: 'signup-1' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'You can only cancel your own workshop signup',
    })
    expect(getAllMock).toHaveBeenCalledTimes(1)
    expect(cancelMock).not.toHaveBeenCalled()
  })

  it('cancels the caller’s own signup', async () => {
    getAllMock.mockResolvedValueOnce([
      { _id: 'signup-1', userWorkOSId: 'workos-real' },
    ])
    const caller = createWorkshopCaller({ id: 'workos-real' })
    const result = await caller.workshop.cancelSignup({ signupId: 'signup-1' })
    expect(result.success).toBe(true)
    expect(cancelMock).toHaveBeenCalledWith('signup-1')
  })
})

describe('workshop.getMySignups scoping', () => {
  it('scopes the query to the session id', async () => {
    getSignupsMock.mockResolvedValueOnce([{ _id: 's1' }])
    const caller = createWorkshopCaller({ id: 'workos-real' })
    const result = await caller.workshop.getMySignups()
    expect(result.count).toBe(1)
    expect(getSignupsMock).toHaveBeenCalledWith(
      'workos-real',
      'conf-1',
      undefined,
    )
  })

  it('returns an empty list when there is no WorkOS session', async () => {
    const caller = createAnonymousCaller()
    const result = await caller.workshop.getMySignups()
    expect(result.data).toEqual([])
    expect(getSignupsMock).not.toHaveBeenCalled()
  })
})

/**
 * #1294. Each refusal is exercised with the OTHER two conditions satisfied, and
 * asserted on its own message, so no case can pass because a different
 * condition refused first. Every case also proves guard-before-fetch: a refused
 * caller triggers no signup read or write.
 */
describe('attendee procedures enforce the portal access decision', () => {
  const procedures = [
    [
      'signup',
      (c: ReturnType<typeof createWorkshopCaller>) =>
        c.workshop.signup(baseSignupInput),
    ],
    [
      'cancelSignup',
      (c: ReturnType<typeof createWorkshopCaller>) =>
        c.workshop.cancelSignup({ signupId: 'signup-1' }),
    ],
    [
      'getMySignups',
      (c: ReturnType<typeof createWorkshopCaller>) => c.workshop.getMySignups(),
    ],
  ] as const

  describe.each(procedures)('%s', (_name, call) => {
    it('refuses when workshops are not enabled for the org', async () => {
      // Verified email + a workshop ticket; only the feature is missing.
      vi.stubEnv('PLATFORM_ORG_ID', 'some-other-org')

      await expect(call(createWorkshopCaller())).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Workshop signup is not available for this conference.',
      })
      // Cheapest condition first: the vendor was never asked.
      expect(ticketing.fetchEventTickets).not.toHaveBeenCalled()
      expectNoSignupIO()
    })

    it('refuses an unverified email even when it matches a workshop ticket', async () => {
      // Feature on + a workshop ticket for this address; only verification
      // is missing.
      await expect(
        call(createWorkshopCaller({ emailVerified: false })),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('has not been verified'),
      })
      expect(ticketing.fetchEventTickets).not.toHaveBeenCalled()
      expectNoSignupIO()
    })

    it('refuses a verified attendee with no ticket', async () => {
      ticketing.fetchEventTickets.mockResolvedValue([
        ticket('someone-else@example.com'),
      ])

      await expect(call(createWorkshopCaller())).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining(
          'No ticket found for attendee@example.com',
        ),
      })
      expect(ticketing.fetchEventTickets).toHaveBeenCalledTimes(1)
      expectNoSignupIO()
    })

    it('refuses a verified attendee whose ticket does not grant workshops', async () => {
      ticketing.fetchEventTickets.mockResolvedValue([
        ticket('attendee@example.com', ORDINARY_TICKET),
      ])

      await expect(call(createWorkshopCaller())).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('No valid workshop ticket found'),
      })
      expectNoSignupIO()
    })

    it('refuses when the conference has no ticketing configured (fail closed)', async () => {
      ticketing.resolve.mockResolvedValue({
        configured: false,
        provider: null,
        eventRef: null,
      })

      await expect(call(createWorkshopCaller())).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('Unable to verify workshop ticket'),
      })
      expectNoSignupIO()
    })

    it('refuses when the provider read fails and no list has arrived yet (fail closed)', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      ticketing.fetchEventTickets.mockRejectedValue(new Error('vendor down'))

      await expect(call(createWorkshopCaller())).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: expect.stringContaining('Unable to verify workshop ticket'),
      })
      expectNoSignupIO()
    })
  })

  it('lets a verified ticket holder through to the signup write', async () => {
    const result = await createWorkshopCaller().workshop.signup(baseSignupInput)

    expect(result.success).toBe(true)
    expect(createSignupMock).toHaveBeenCalledTimes(1)
    expect(createSignupMock.mock.calls[0][0].userEmail).toBe(
      'attendee@example.com',
    )
  })

  it('decides from the LIVE ticket-type roles, not the cached conference', async () => {
    // The domain conference fixture carries no roles (the legacy bridge would
    // grant WORKSHOP_TICKET). The live document declares its own type instead,
    // which makes the declared set the whole answer.
    h.fetch.mockResolvedValue({
      ticketTypeRoles: [
        { typeName: 'Workshopdag 2026', admits: true, grantsWorkshop: true },
      ],
    } as never)
    ticketing.fetchEventTickets.mockResolvedValue([
      ticket('attendee@example.com', 'Workshopdag 2026'),
      ticket('real@example.com', WORKSHOP_TICKET),
    ])

    // Holder of the DECLARED type: through to the write.
    await createWorkshopCaller().workshop.signup(baseSignupInput)
    expect(createSignupMock).toHaveBeenCalledTimes(1)

    // Holder of the legacy name, which this conference never declared.
    await expect(
      createWorkshopCaller({ email: 'real@example.com' }).workshop.signup(
        baseSignupInput,
      ),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining(
        'has not been set up for workshop access',
      ),
    })
    expect(createSignupMock).toHaveBeenCalledTimes(1)
  })

  it('shares one provider read across a burst of attendee actions', async () => {
    const caller = createWorkshopCaller()

    await Promise.all([
      caller.workshop.getMySignups(),
      caller.workshop.signup(baseSignupInput),
      caller.workshop.getMySignups(),
    ])

    expect(ticketing.fetchEventTickets).toHaveBeenCalledTimes(1)
  })
})

describe('workshop admin procedures remain NextAuth-gated', () => {
  it('rejects a WorkOS attendee from admin.manualSignup', async () => {
    // A WorkOS attendee session must NOT grant admin access — admin procedures
    // key on the NextAuth organizer session, which the attendee does not have.
    const caller = createWorkshopCaller({ id: 'workos-real' })
    await expect(
      caller.workshop.admin.manualSignup({
        ...baseSignupInput,
        userWorkOSId: 'workos-real',
        userEmail: 'real@example.com',
        userName: 'Real User',
      }),
    ).rejects.toThrow(/UNAUTHORIZED|FORBIDDEN|Authentication required/)
  })

  it('allows an organizer (NextAuth) through the admin auth gate', async () => {
    // The admin caller passes the auth/admin middleware unchanged by this fix.
    const caller = createAdminCaller()
    const result = await caller.workshop.admin.getSummary()
    expect(result.success).toBe(true)
  })

  it('manualSignup writes the DOMAIN conference, ignoring a smuggled conference ref', async () => {
    const caller = createAdminCaller()
    await caller.workshop.admin.manualSignup({
      ...baseSignupInput,
      userWorkOSId: 'manual-user',
      userEmail: 'participant@example.com',
      userName: 'Participant',
      conference: { _type: 'reference', _ref: 'evil-conf' },
    } as never)

    expect(createSignupMock).toHaveBeenCalledTimes(1)
    const written = createSignupMock.mock.calls[0][0]
    expect(written.conference).toEqual({ _type: 'reference', _ref: 'conf-1' })
    // The duplicate-check read is scoped to the domain conference too.
    expect(getSignupsMock).toHaveBeenCalledWith(
      'manual-user',
      'conf-1',
      undefined,
    )
  })
})
