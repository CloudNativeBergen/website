/**
 * @vitest-environment node
 *
 * THE REGISTRATION WINDOW at `workshop.signup` (#1345, spec
 * `docs/WORKSHOP_SPONSOR_EARLY_ACCESS_SPEC.md` §3 and §6).
 *
 * Through the real router and the real access decision, in the style of
 * `workshop.test.ts`: the workshop data layer, the ticket provider and the
 * conference read are the mocked boundaries. The clock is pinned, and every
 * time below is a literal around it.
 *
 * A sign-up that goes through is asserted on the write it makes; a refusal on
 * its code, its text and on nothing having been read or written about the
 * workshop.
 */
import '../../helpers/workosEnv'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { stubPlatformTicketingAccount } from '../../helpers/ticketingSecrets'
import { createWorkshopCaller } from '../../helpers/trpc'

const h = vi.hoisted(() => ({
  /** The registration times of the conference this request resolves to. */
  times: {} as Record<string, string | null | undefined>,
}))

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

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

vi.mock('@/lib/sanity/client', () => ({
  // The live conference document (ticket-type roles): none, so the built-in
  // list decides who holds a workshop ticket.
  clientReadUncached: { fetch: async () => null },
}))

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

vi.mock('@/lib/workshop/sanity', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/workshop/sanity')>()),
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
    workshop: { _ref: data.workshop._ref, title: 'Kubernetes 101' },
    conference: { _ref: data.conference._ref },
  })),
}))

import {
  getWorkshopSignups,
  createWorkshopSignup,
  checkWorkshopCapacity,
  verifyWorkshopBelongsToConference,
} from '@/lib/workshop/sanity'
import { __resetRedeemedCache } from '@/lib/tickets/speakerStatus'

type LooseMock = ReturnType<typeof vi.fn>
const createSignupMock = createWorkshopSignup as unknown as LooseMock
const getSignupsMock = getWorkshopSignups as unknown as LooseMock
const capacityMock = checkWorkshopCapacity as unknown as LooseMock
const belongsMock = verifyWorkshopBelongsToConference as unknown as LooseMock

const signupInput = {
  experienceLevel: 'beginner' as const,
  operatingSystem: 'linux' as const,
  workshop: { _type: 'reference' as const, _ref: 'workshop-1' },
}

/** The pinned clock: 14:00 in Oslo on Wednesday 10 June 2026. */
const NOW = '2026-06-10T12:00:00.000Z'
const A_SECOND_BEFORE = '2026-06-10T11:59:59.000Z'
const A_SECOND_AFTER = '2026-06-10T12:00:01.000Z'
const LONG_BEFORE = '2026-05-01T07:00:00.000Z'
const LONG_AFTER = '2026-07-01T07:00:00.000Z'

/** The outcome of one sign-up attempt, as a value. */
async function attempt(): Promise<
  | { written: { workshop: string; email: string } }
  | { refused: { code: string; message: string } }
> {
  try {
    await createWorkshopCaller().workshop.signup(signupInput)
  } catch (error) {
    const { code, message } = error as { code: string; message: string }
    // A refusal for the window is made before anything is read or written
    // about the workshop.
    expect(belongsMock).not.toHaveBeenCalled()
    expect(getSignupsMock).not.toHaveBeenCalled()
    expect(capacityMock).not.toHaveBeenCalled()
    expect(createSignupMock).not.toHaveBeenCalled()
    return { refused: { code, message } }
  }
  expect(createSignupMock).toHaveBeenCalledTimes(1)
  const written = createSignupMock.mock.calls[0][0]
  return {
    written: { workshop: written.workshop._ref, email: written.userEmail },
  }
}

const WRITTEN = {
  written: { workshop: 'workshop-1', email: 'attendee@example.com' },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) })
  __resetRedeemedCache()
  h.times = {}
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

describe('workshop.signup and the registration window, as it was before #1345', () => {
  it('with neither time set, signs up', async () => {
    expect(await attempt()).toEqual(WRITTEN)
  })

  it('with no start set, is open from the beginning: signs up long before the end', async () => {
    h.times = { workshopRegistrationEnd: LONG_AFTER }
    vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'))
    expect(await attempt()).toEqual(WRITTEN)
  })

  it('with no end set, never closes: signs up long after the start', async () => {
    h.times = { workshopRegistrationStart: LONG_BEFORE }
    vi.setSystemTime(new Date('2099-01-01T00:00:00.000Z'))
    expect(await attempt()).toEqual(WRITTEN)
  })

  it('with times stored as null, signs up', async () => {
    h.times = { workshopRegistrationStart: null, workshopRegistrationEnd: null }
    expect(await attempt()).toEqual(WRITTEN)
  })

  it('between the start and the end, signs up', async () => {
    h.times = {
      workshopRegistrationStart: LONG_BEFORE,
      workshopRegistrationEnd: LONG_AFTER,
    }
    expect(await attempt()).toEqual(WRITTEN)
  })

  it('at the very instant of the start, signs up', async () => {
    h.times = { workshopRegistrationStart: NOW }
    expect(await attempt()).toEqual(WRITTEN)
  })

  it('at the very instant of the end, signs up', async () => {
    h.times = { workshopRegistrationEnd: NOW }
    expect(await attempt()).toEqual(WRITTEN)
  })

  it('a second before the start, refuses and says when it opens', async () => {
    h.times = { workshopRegistrationStart: A_SECOND_AFTER }
    expect(await attempt()).toEqual({
      refused: {
        code: 'PRECONDITION_FAILED',
        message: expect.stringMatching(/^Workshop registration opens on /),
      },
    })
  })

  it('a second after the end, refuses as closed', async () => {
    h.times = { workshopRegistrationEnd: A_SECOND_BEFORE }
    expect(await attempt()).toEqual({
      refused: {
        code: 'PRECONDITION_FAILED',
        message: 'Workshop registration has closed',
      },
    })
  })

  it('with an end that lies before a start still ahead, refuses as not open yet', async () => {
    h.times = {
      workshopRegistrationStart: LONG_AFTER,
      workshopRegistrationEnd: LONG_BEFORE,
    }
    expect(await attempt()).toEqual({
      refused: {
        code: 'PRECONDITION_FAILED',
        message: expect.stringMatching(/^Workshop registration opens on /),
      },
    })
  })
})
