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
import { createAdminCaller, createWorkshopCaller } from '../../helpers/trpc'

const h = vi.hoisted(() => ({
  /** The registration times of the conference this request resolves to. */
  times: {} as Record<string, string | null | undefined>,
  /** The conference document as stored, for the organizer's save. */
  stored: { _id: 'conf-1', _type: 'conference' } as Record<string, unknown>,
  /** Every write issued, in order: `patch:<id>`. */
  writes: [] as string[],
  /** What each of those patches set, as serialised by the real client. */
  sets: [] as unknown[],
  /** Other tenants' conferences in the same dataset. */
  others: [] as Record<string, unknown>[],
  /** The parameters of every live read of the organizer's save. */
  reads: [] as unknown[],
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

vi.mock('@/lib/sanity/client', async () => {
  const { createClient } = await import('@sanity/client')
  const { parse, evaluate } = await import('groq-js')
  const { createRequire: req } = await import('node:module')
  const { Mutation } = req(req(import.meta.url).resolve('sanity/package.json'))(
    '@sanity/mutator',
  ) as {
    Mutation: new (o: { mutations: unknown[] }) => {
      apply: (d: unknown) => Record<string, unknown> | null
    }
  }
  const client = createClient({
    projectId: 'test',
    dataset: 'test',
    apiVersion: '2024-01-01',
    useCdn: false,
  })

  return {
    // LIVE READS ARE REAL GROQ, evaluated by `groq-js` over the stored
    // conference and the other tenants' ones. (The ticket-type roles of the
    // sign-up's access decision are read here too: none are stored, so the
    // built-in list decides who holds a workshop ticket.)
    clientReadUncached: {
      fetch: async (query: string, params: Record<string, unknown> = {}) => {
        if (query.includes('workshopRegistration')) h.reads.push(params)
        const dataset = [h.stored, ...h.others]
        return await (await evaluate(parse(query), { dataset, params })).get()
      },
    },
    clientWrite: {
      // A REAL patch: built by the real `@sanity/client`, serialised, and
      // applied to the stored document by Sanity's own `@sanity/mutator`.
      patch: (id: string) => {
        const patch = client.patch(id)
        patch.commit = (async () => {
          h.writes.push(`patch:${id}`)
          h.sets.push(patch.serialize().set)
          if (id !== h.stored._id) throw new Error(`no such document: ${id}`)
          const next = new Mutation({
            mutations: [{ patch: patch.serialize() }],
          }).apply(structuredClone(h.stored))
          if (next) h.stored = next
          return {}
        }) as typeof patch.commit
        return patch
      },
    },
  }
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
import { revalidateTag } from 'next/cache'

type LooseMock = ReturnType<typeof vi.fn>
const createSignupMock = createWorkshopSignup as unknown as LooseMock
const getSignupsMock = getWorkshopSignups as unknown as LooseMock
const capacityMock = checkWorkshopCapacity as unknown as LooseMock
const belongsMock = verifyWorkshopBelongsToConference as unknown as LooseMock
const revalidateMock = revalidateTag as unknown as LooseMock

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
  h.stored = { _id: 'conf-1', _type: 'conference', title: 'CNDN' }
  h.writes = []
  h.sets = []
  h.others = []
  h.reads = []
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

  // CHANGED FROM TODAY (#1345, review round 1): this combination used to be
  // refused as "opens on …", because the start was compared first. A passed
  // end now wins, as the portal page, its list and the resend action always
  // said. No save through the admin stores it; Sanity Studio can.
  it('with an end that lies before a start still ahead, refuses as closed', async () => {
    h.times = {
      workshopRegistrationStart: LONG_AFTER,
      workshopRegistrationEnd: LONG_BEFORE,
    }
    expect(await attempt()).toEqual({
      refused: {
        code: 'PRECONDITION_FAILED',
        message: 'Workshop registration has closed',
      },
    })
  })
})

describe('workshop.signup before the official opening (#1345)', () => {
  it('names the day and the time of day, in the conference’s time zone', async () => {
    // 22:30 UTC on Sunday 14 June is 00:30 on Monday 15 June in Oslo: the day
    // itself differs between the server's zone (UTC here) and the conference's.
    h.times = { workshopRegistrationStart: '2026-06-14T22:30:00.000Z' }
    expect(await attempt()).toEqual({
      refused: {
        code: 'PRECONDITION_FAILED',
        message:
          'Workshop registration opens on Monday, June 15, 2026 at 12:30 AM',
      },
    })
  })

  it('names the official opening, whatever the sponsor start time is: nobody has early access yet', async () => {
    h.times = {
      workshopRegistrationSponsorStart: LONG_BEFORE,
      workshopRegistrationStart: '2026-06-14T22:30:00.000Z',
      workshopRegistrationEnd: LONG_AFTER,
    }
    expect(await attempt()).toEqual({
      refused: {
        code: 'PRECONDITION_FAILED',
        message:
          'Workshop registration opens on Monday, June 15, 2026 at 12:30 AM',
      },
    })
  })
})

/**
 * THE ORGANIZER'S SAVE (#1345, spec §3). A refused save is asserted on the
 * refusal and on the stored document being what it was, with no write issued;
 * an accepted one on the stored values.
 */
describe('workshop.admin.updateRegistrationTimes and the sponsor start time', () => {
  const SPONSOR = '2026-06-01T06:00:00.000Z'
  const OFFICIAL = '2026-06-15T06:30:00.000Z'
  const END = '2026-07-01T07:00:00.000Z'

  /** What is stored before every save below: a valid set of three times. */
  const BEFORE = {
    _id: 'conf-1',
    _type: 'conference',
    title: 'CNDN',
    workshopRegistrationSponsorStart: '2026-05-02T06:00:00.000Z',
    workshopRegistrationStart: '2026-05-10T06:00:00.000Z',
    workshopRegistrationEnd: '2026-05-20T06:00:00.000Z',
  }

  beforeEach(() => {
    h.stored = structuredClone(BEFORE)
  })

  type Save = Parameters<
    ReturnType<
      typeof createAdminCaller
    >['workshop']['admin']['updateRegistrationTimes']
  >[0]

  /** The outcome of one save, as a value. */
  async function save(input: Save) {
    try {
      await createAdminCaller().workshop.admin.updateRegistrationTimes(input)
    } catch (error) {
      const { code, message } = error as { code: string; message: string }
      // A refused save invalidates nothing: there is nothing new to show.
      expect(revalidateMock.mock.calls).toEqual([])
      return { refused: { code, message }, writes: h.writes, stored: h.stored }
    }
    return { writes: h.writes, stored: h.stored }
  }

  const refusedWith = (message: string) => ({
    refused: { code: 'BAD_REQUEST', message },
    writes: [],
    stored: BEFORE,
  })

  const NOT_EARLIER =
    'Sponsor early access must start before registration opens for everyone'
  const NO_OFFICIAL_OPENING =
    'Sponsor early access needs a time when registration opens for everyone'

  it('stores a sponsor start time that is earlier than the official opening', async () => {
    expect(
      await save({
        sponsorStartDate: SPONSOR,
        startDate: OFFICIAL,
        endDate: END,
      }),
    ).toEqual({
      writes: ['patch:conf-1'],
      stored: {
        ...BEFORE,
        workshopRegistrationSponsorStart: SPONSOR,
        workshopRegistrationStart: OFFICIAL,
        workshopRegistrationEnd: END,
      },
    })
  })

  it('invalidates what a save invalidated before: the settings and this conference', async () => {
    await save({ sponsorStartDate: SPONSOR, startDate: OFFICIAL, endDate: END })
    expect(revalidateMock.mock.calls).toEqual([
      ['admin:settings', 'default'],
      ['sanity:conference-conf-1', 'default'],
    ])
  })

  it('stores a sponsor start time given in another offset as the same instant', async () => {
    const { stored } = await save({
      sponsorStartDate: '2026-06-01T08:00:00+02:00',
      startDate: OFFICIAL,
      endDate: null,
    })
    expect(stored).toMatchObject({
      workshopRegistrationSponsorStart: SPONSOR,
      workshopRegistrationStart: OFFICIAL,
      workshopRegistrationEnd: null,
    })
  })

  it('clears the sponsor start time and keeps the other two', async () => {
    expect(
      await save({ sponsorStartDate: null, startDate: OFFICIAL, endDate: END }),
    ).toEqual({
      writes: ['patch:conf-1'],
      stored: {
        ...BEFORE,
        workshopRegistrationSponsorStart: null,
        workshopRegistrationStart: OFFICIAL,
        workshopRegistrationEnd: END,
      },
    })
  })

  it('refuses a sponsor start time equal to the official opening', async () => {
    expect(
      await save({
        sponsorStartDate: OFFICIAL,
        startDate: OFFICIAL,
        endDate: END,
      }),
    ).toEqual(refusedWith(NOT_EARLIER))
  })

  it('refuses a sponsor start time equal to the official opening in another spelling of the instant', async () => {
    expect(
      await save({
        sponsorStartDate: '2026-06-15T08:30:00+02:00',
        startDate: OFFICIAL,
        endDate: END,
      }),
    ).toEqual(refusedWith(NOT_EARLIER))
  })

  it('refuses a sponsor start time later than the official opening', async () => {
    expect(
      await save({
        sponsorStartDate: '2026-06-15T06:30:01.000Z',
        startDate: OFFICIAL,
        endDate: END,
      }),
    ).toEqual(refusedWith(NOT_EARLIER))
  })

  it('refuses moving the official opening to before the sponsor start time', async () => {
    expect(
      await save({
        sponsorStartDate: BEFORE.workshopRegistrationSponsorStart,
        startDate: '2026-05-01T06:00:00.000Z',
        endDate: BEFORE.workshopRegistrationEnd,
      }),
    ).toEqual(refusedWith(NOT_EARLIER))
  })

  it('refuses a sponsor start time with no official opening', async () => {
    h.stored = { _id: 'conf-1', _type: 'conference', title: 'CNDN' }
    expect(
      await save({ sponsorStartDate: SPONSOR, startDate: null, endDate: null }),
    ).toEqual({
      ...refusedWith(NO_OFFICIAL_OPENING),
      stored: { _id: 'conf-1', _type: 'conference', title: 'CNDN' },
    })
  })

  it('refuses clearing the official opening while a sponsor start time is set', async () => {
    expect(
      await save({
        sponsorStartDate: BEFORE.workshopRegistrationSponsorStart,
        startDate: null,
        endDate: BEFORE.workshopRegistrationEnd,
      }),
    ).toEqual(refusedWith(NO_OFFICIAL_OPENING))
  })

  it('still refuses an end that is not after the start', async () => {
    expect(
      await save({ sponsorStartDate: null, startDate: END, endDate: OFFICIAL }),
    ).toEqual(refusedWith('End date must be after start date'))
  })

  /**
   * OMITTED MEANS UNCHANGED (review round 1). A form seeded before a colleague
   * saved sends only what its organizer changed, so it can neither erase a
   * time it never showed nor be judged against the times it believed in: the
   * rule is applied to what WILL be stored, the sent times over the stored
   * ones, read live.
   */
  describe('a save that sends only some of the times', () => {
    /** As `BEFORE`, with the sponsor start time in a spelling no save of ours writes. */
    const STORED = {
      ...BEFORE,
      workshopRegistrationSponsorStart: '2026-05-02T08:00:00+02:00',
    }

    beforeEach(() => {
      h.stored = structuredClone(STORED)
    })

    const refused = (message: string) => ({
      ...refusedWith(message),
      stored: STORED,
    })

    it('of only the end, leaves the stored sponsor start time and official opening as they are', async () => {
      expect(await save({ endDate: END })).toEqual({
        writes: ['patch:conf-1'],
        stored: { ...STORED, workshopRegistrationEnd: END },
      })
      // The patch names the one field it was sent, and no other.
      expect(h.sets).toEqual([{ workshopRegistrationEnd: END }])
    })

    it('from a client that knows two times, is accepted and leaves the sponsor start time alone', async () => {
      expect(await save({ startDate: OFFICIAL, endDate: END })).toEqual({
        writes: ['patch:conf-1'],
        stored: {
          ...STORED,
          workshopRegistrationStart: OFFICIAL,
          workshopRegistrationEnd: END,
        },
      })
      expect(h.sets).toEqual([
        { workshopRegistrationStart: OFFICIAL, workshopRegistrationEnd: END },
      ])
    })

    it('of only the sponsor start time, earlier than the stored official opening, stores it', async () => {
      expect(
        await save({ sponsorStartDate: '2026-05-05T06:00:00.000Z' }),
      ).toEqual({
        writes: ['patch:conf-1'],
        stored: {
          ...STORED,
          workshopRegistrationSponsorStart: '2026-05-05T06:00:00.000Z',
        },
      })
    })

    it('refuses clearing the official opening while a sponsor start time is STORED and not sent', async () => {
      expect(await save({ startDate: null })).toEqual(
        refused(NO_OFFICIAL_OPENING),
      )
    })

    it('refuses moving the official opening to before a sponsor start time that is STORED and not sent', async () => {
      expect(await save({ startDate: '2026-05-01T06:00:00.000Z' })).toEqual(
        refused(NOT_EARLIER),
      )
    })

    it('refuses moving the official opening to the very instant of the stored sponsor start time', async () => {
      expect(await save({ startDate: '2026-05-02T06:00:00.000Z' })).toEqual(
        refused(NOT_EARLIER),
      )
    })

    it('refuses a sponsor start time later than the STORED official opening', async () => {
      expect(
        await save({ sponsorStartDate: '2026-05-11T06:00:00.000Z' }),
      ).toEqual(refused(NOT_EARLIER))
    })

    it('refuses an end that is not after the STORED start', async () => {
      expect(await save({ endDate: '2026-05-09T06:00:00.000Z' })).toEqual(
        refused('End date must be after start date'),
      )
    })

    it('refuses a start that is not before the STORED end', async () => {
      expect(await save({ startDate: '2026-05-21T06:00:00.000Z' })).toEqual(
        refused('End date must be after start date'),
      )
    })

    it('judges against THIS conference’s stored times, with one live read of it', async () => {
      // Another tenant has a sponsor start time; this one has none, so its
      // official opening can be cleared.
      h.stored = {
        _id: 'conf-1',
        _type: 'conference',
        title: 'CNDN',
        workshopRegistrationStart: BEFORE.workshopRegistrationStart,
      }
      const OTHER = { ...BEFORE, _id: 'conf-2', title: 'Another tenant' }
      h.others = [structuredClone(OTHER)]

      expect(await save({ startDate: null })).toEqual({
        writes: ['patch:conf-1'],
        stored: {
          _id: 'conf-1',
          _type: 'conference',
          title: 'CNDN',
          workshopRegistrationStart: null,
        },
      })
      expect(h.reads).toEqual([{ id: 'conf-1' }])
      expect(h.others).toEqual([OTHER])
    })

    it('that sends nothing reads nothing and writes nothing', async () => {
      expect(await save({})).toEqual({ writes: [], stored: STORED })
      expect(h.reads).toEqual([])
      expect(revalidateMock.mock.calls).toEqual([])
    })
  })
})
