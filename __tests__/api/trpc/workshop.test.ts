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
 *   reachable via a WorkOS attendee session.
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
      // The owning tenant (#689): the organizer workshop procedures are gated
      // on the `workshops` feature, which resolves from this org document.
      organization: { _ref: 'org-1', _type: 'reference' },
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
    _id: 'org-1',
    name: 'Platform',
    slug: 'platform-org',
  })),
  getOrganizationRefForCurrentConference: vi.fn(async () => 'org-1'),
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
} from '@/lib/workshop/sanity'

type LooseMock = ReturnType<typeof vi.fn>
const getSignupsMock = getWorkshopSignups as unknown as LooseMock
const createSignupMock = createWorkshopSignup as unknown as LooseMock
const getAllMock = getAllWorkshopSignups as unknown as LooseMock
const cancelMock = cancelWorkshopSignup as unknown as LooseMock

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
  // Names the org above as the platform org, which is what grants `workshops`.
  vi.stubEnv('PLATFORM_ORG_SLUG', 'platform-org')
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
    await expect(
      caller.workshop.cancelSignup({ signupId: 'missing' }),
    ).rejects.toThrow(/NOT_FOUND|not found/)
    expect(cancelMock).not.toHaveBeenCalled()
  })

  it('forbids cancelling another attendee’s signup', async () => {
    getAllMock.mockResolvedValueOnce([
      { _id: 'signup-1', userWorkOSId: 'someone-else' },
    ])
    const caller = createWorkshopCaller({ id: 'workos-real' })
    await expect(
      caller.workshop.cancelSignup({ signupId: 'signup-1' }),
    ).rejects.toThrow(/FORBIDDEN|your own/)
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
