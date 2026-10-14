/**
 * @vitest-environment node
 *
 * What an organizer is told when a seat decision (#1344) refuses or goes past
 * capacity. The decisions themselves are proven on stored documents in
 * `src/lib/workshop/seats.sanity.test.ts`; here `seats` is mocked, and only
 * the router's reading of its answers is under test: a clear message, never
 * a 500.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: vi.fn(async () => ({
    conference: { _id: 'conf-A', organization: { _ref: 'org-A' } },
    domain: 'localhost',
    error: null,
  })),
}))
/** The sign-ups as the document store has them now: by default, confirmed. */
const current = vi.hoisted(() => ({ status: {} as Record<string, string> }))
vi.mock('@/lib/sanity/client', () => {
  const client = {
    fetch: vi.fn(async () => null),
    getDocuments: vi.fn(async (ids: string[]) =>
      ids.map((_id) => ({ _id, status: current.status[_id] ?? 'confirmed' })),
    ),
  }
  return {
    clientRead: client,
    clientReadCached: client,
    clientReadUncached: client,
    clientWrite: client,
  }
})
vi.mock('@/lib/features/workshops', () => ({
  isWorkshopsEnabledForConference: vi.fn().mockResolvedValue(true),
}))
vi.mock('@/lib/email/workshop', () => ({
  sendBasicWorkshopConfirmation: vi.fn(async () => {}),
}))

const ws = vi.hoisted(() => ({
  getAllWorkshopSignups: vi.fn(),
  getWorkshopById: vi.fn(),
}))
vi.mock('@/lib/workshop/sanity', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  getAllWorkshopSignups: ws.getAllWorkshopSignups,
  getWorkshopById: ws.getWorkshopById,
}))
const seats = vi.hoisted(() => ({
  signUpForWorkshop: vi.fn(),
  confirmSignups: vi.fn(),
  changeCapacity: vi.fn(),
}))
vi.mock('@/lib/workshop/seats', () => seats)

import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import { workshopRouter } from './workshop'
import { sendBasicWorkshopConfirmation } from '@/lib/email/workshop'

const t = initTRPC.context<Context>().create()

function ctx(): Context {
  const speaker = {
    _id: 'sp-admin',
    name: 'Admin',
    isOrganizer: true,
    organizerOrgIds: ['org-A'],
  }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return {
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    } as unknown as Context['session'],
    speaker: speaker as unknown as Context['speaker'],
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}

const admin = () => t.createCallerFactory(workshopRouter)(ctx()).admin

const row = (id: string, workshopId: string, status = 'waitlist') => ({
  _id: id,
  status,
  userEmail: `${id}@example.com`,
  userName: id,
  workshop: { _id: workshopId, title: `Workshop ${workshopId}` },
})

const manualInput = {
  userWorkOSId: 'user_1',
  userEmail: 'p@example.com',
  userName: 'Person',
  experienceLevel: 'beginner' as const,
  operatingSystem: 'linux' as const,
  notes: 'Bringing my own laptop',
  workshop: { _type: 'reference' as const, _ref: 'w-1' },
}

beforeEach(() => {
  vi.clearAllMocks()
  current.status = {}
  ws.getWorkshopById.mockResolvedValue({ _id: 'w-1', capacity: 5 })
})

describe('admin.manualSignup', () => {
  it.each([
    ['full', 'CONFLICT', 'Workshop is full'],
    [
      'already-signed-up',
      'CONFLICT',
      'User is already signed up for this workshop',
    ],
    ['not-found', 'BAD_REQUEST', 'Workshop does not belong to this conference'],
    [
      'busy',
      'TOO_MANY_REQUESTS',
      'Many people are signing up for this workshop right now. Nothing was saved. Try again in a moment.',
    ],
    ['removed', 'CONFLICT', 'The sign-up was removed just after it was saved.'],
  ])(
    'refused as %s: %s with a clear message',
    async (refused, code, message) => {
      seats.signUpForWorkshop.mockResolvedValue({ refused })

      await expect(admin().manualSignup(manualInput)).rejects.toMatchObject({
        code,
        message,
      })
    },
  )

  it('asks for a refusal, not the waitlist, when the workshop is full, within the domain conference', async () => {
    seats.signUpForWorkshop.mockResolvedValue({
      signup: { _id: 's-1', userEmail: 'p@example.com', userName: 'Person' },
    })

    await admin().manualSignup(manualInput)

    expect(seats.signUpForWorkshop).toHaveBeenCalledWith(
      expect.objectContaining({
        userWorkOSId: 'user_1',
        notes: 'Bringing my own laptop',
        workshopId: 'w-1',
        conferenceId: 'conf-A',
      }),
      { whenFull: 'refuse' },
    )
  })
})

describe('admin.batchConfirmSignups', () => {
  it('confirms per workshop, and names the workshops it took beyond capacity with an accepted count', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([
      row('s-1', 'w-1'),
      row('s-2', 'w-2'),
      row('s-3', 'w-2'),
    ])
    seats.confirmSignups.mockImplementation(
      async (workshopId: string, _conf: string, ids: string[]) =>
        workshopId === 'w-1'
          ? { confirmed: ids, newlyConfirmed: ids, seatsTaken: 3, capacity: 5 }
          : {
              confirmed: ids,
              newlyConfirmed: ids,
              seatsTaken: 31,
              capacity: 30,
            },
    )

    const result = await admin().batchConfirmSignups({
      signupIds: ['s-1', 's-2', 's-3'],
      sendEmails: true,
    })

    expect(seats.confirmSignups).toHaveBeenCalledWith(
      'w-1',
      'conf-A',
      ['s-1'],
      {
        acceptSeats: undefined,
      },
    )
    expect(seats.confirmSignups).toHaveBeenCalledWith(
      'w-2',
      'conf-A',
      ['s-2', 's-3'],
      { acceptSeats: undefined },
    )
    expect(result.results).toEqual({
      succeeded: 3,
      failed: 0,
      total: 3,
      beyondCapacity: [
        { workshopTitle: 'Workshop w-2', seatsTaken: 31, capacity: 30 },
      ],
      full: [],
    })
    expect(result.message).toBe(
      'Confirmed 3 signups. Beyond capacity: Workshop w-2 (31 of 30 seats).',
    )
    expect(sendBasicWorkshopConfirmation).toHaveBeenCalledTimes(3)
  })

  it('counts a workshop whose seats could not be decided (busy) as failed, not a 500, says to try again there, and emails no one there', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([
      row('s-1', 'w-1'),
      row('s-2', 'w-2'),
    ])
    seats.confirmSignups.mockImplementation(async (workshopId: string) =>
      workshopId === 'w-1'
        ? {
            confirmed: ['s-1'],
            newlyConfirmed: ['s-1'],
            seatsTaken: 1,
            capacity: 5,
          }
        : { refused: 'busy' },
    )

    const result = await admin().batchConfirmSignups({
      signupIds: ['s-1', 's-2'],
      sendEmails: true,
    })

    expect(result.results).toMatchObject({ succeeded: 1, failed: 1 })
    expect(result.message).toBe(
      'Confirmed 1 signup, 1 failed. Many people were signing up for Workshop w-2, so nothing was saved there. Try again in a moment.',
    )
    expect(sendBasicWorkshopConfirmation).toHaveBeenCalledTimes(1)
  })

  it('a workshop whose write failed for another reason is named too, not counted silently', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([
      row('s-1', 'w-1'),
      row('s-2', 'w-2'),
    ])
    seats.confirmSignups.mockImplementation(async (workshopId: string) => {
      if (workshopId === 'w-2') throw new Error('503: dataset unavailable')
      return {
        confirmed: ['s-1'],
        newlyConfirmed: ['s-1'],
        seatsTaken: 1,
        capacity: 5,
      }
    })

    const result = await admin().batchConfirmSignups({
      signupIds: ['s-1', 's-2'],
      sendEmails: false,
    })

    expect(result.results).toMatchObject({ succeeded: 1, failed: 1 })
    expect(result.message).toBe(
      'Confirmed 1 signup, 1 failed. Something went wrong for Workshop w-2, so no one was confirmed there. Try again.',
    )
  })

  it('names no workshop beyond capacity, and emails no one, where it confirmed no one new', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([row('s-1', 'w-1')])
    seats.confirmSignups.mockResolvedValue({
      confirmed: ['s-1'],
      newlyConfirmed: [],
      seatsTaken: 31,
      capacity: 30,
    })

    const result = await admin().batchConfirmSignups({
      signupIds: ['s-1'],
      sendEmails: true,
    })

    expect(result.message).toBe('Confirmed 1 signup.')
    expect(result.results.beyondCapacity).toEqual([])
    expect(result.results.full).toEqual([])
    expect(sendBasicWorkshopConfirmation).not.toHaveBeenCalled()
  })

  it('a sign-up gone by the time of the write is counted as failed', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([row('s-1', 'w-1')])
    seats.confirmSignups.mockResolvedValue({
      confirmed: [],
      newlyConfirmed: [],
      seatsTaken: 0,
      capacity: 5,
    })

    const result = await admin().batchConfirmSignups({
      signupIds: ['s-1'],
      sendEmails: true,
    })

    expect(result.results).toMatchObject({ succeeded: 0, failed: 1 })
    expect(sendBasicWorkshopConfirmation).not.toHaveBeenCalled()
  })

  it('a workshop refused as full (#1358) is answered with its numbers and sign-ups, confirms the rest, and emails no one there', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([
      row('s-1', 'w-1'),
      row('s-2', 'w-2'),
      row('s-3', 'w-2'),
    ])
    seats.confirmSignups.mockImplementation(
      async (workshopId: string, _conf: string, ids: string[]) =>
        workshopId === 'w-1'
          ? { confirmed: ids, newlyConfirmed: ids, seatsTaken: 3, capacity: 5 }
          : {
              refused: 'full',
              confirmed: [],
              seatsTaken: 30,
              capacity: 30,
              after: 32,
            },
    )

    const result = await admin().batchConfirmSignups({
      signupIds: ['s-1', 's-2', 's-3'],
      sendEmails: true,
    })

    expect(result.results).toEqual({
      succeeded: 1,
      failed: 2,
      total: 3,
      beyondCapacity: [],
      full: [
        {
          workshopId: 'w-2',
          workshopTitle: 'Workshop w-2',
          seatsTaken: 30,
          capacity: 30,
          after: 32,
          signupIds: ['s-2', 's-3'],
        },
      ],
    })
    expect(result.message).toBe(
      'Confirmed 1 signup, 2 failed. Full: Workshop w-2 (30 of 30 seats; confirming 2 goes 2 past capacity).',
    )
    expect(sendBasicWorkshopConfirmation).toHaveBeenCalledTimes(1)
  })

  it('a refused workshop: a member confirmed already counts as confirmed, not as failed, and is not among the refused ids', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([
      row('s-1', 'w-2', 'confirmed'),
      row('s-2', 'w-2'),
    ])
    seats.confirmSignups.mockResolvedValue({
      refused: 'full',
      confirmed: ['s-1'],
      seatsTaken: 30,
      capacity: 30,
      after: 31,
    })

    const result = await admin().batchConfirmSignups({
      signupIds: ['s-1', 's-2'],
      sendEmails: true,
    })

    expect(result.results).toEqual({
      succeeded: 1,
      failed: 1,
      total: 2,
      beyondCapacity: [],
      full: [
        {
          workshopId: 'w-2',
          workshopTitle: 'Workshop w-2',
          seatsTaken: 30,
          capacity: 30,
          after: 31,
          signupIds: ['s-2'],
        },
      ],
    })
    expect(result.message).toBe(
      'Confirmed 1 signup, 1 failed. Full: Workshop w-2 (30 of 30 seats; confirming 1 goes 1 past capacity).',
    )
    // Confirmed already: no "you are confirmed" email, as for any confirm.
    expect(sendBasicWorkshopConfirmation).not.toHaveBeenCalled()
  })

  it('passes each workshop its own accepted count, and none to a workshop without one', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([
      row('s-1', 'w-1'),
      row('s-2', 'w-2'),
    ])
    seats.confirmSignups.mockImplementation(
      async (_w: string, _c: string, ids: string[]) => ({
        confirmed: ids,
        newlyConfirmed: ids,
        seatsTaken: 1,
        capacity: 5,
      }),
    )

    await admin().batchConfirmSignups({
      signupIds: ['s-1', 's-2'],
      sendEmails: false,
      acceptSeats: { 'w-2': 31 },
    })

    expect(seats.confirmSignups).toHaveBeenCalledWith(
      'w-1',
      'conf-A',
      ['s-1'],
      {
        acceptSeats: undefined,
      },
    )
    expect(seats.confirmSignups).toHaveBeenCalledWith(
      'w-2',
      'conf-A',
      ['s-2'],
      {
        acceptSeats: 31,
      },
    )
  })
})

describe('admin.confirmSignup', () => {
  it('refused as full (#1358): a structured answer with the numbers, not an error, and no email', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([row('s-1', 'w-1')])
    seats.confirmSignups.mockResolvedValue({
      refused: 'full',
      confirmed: [],
      seatsTaken: 30,
      capacity: 30,
      after: 31,
    })

    const result = await admin().confirmSignup({
      signupId: 's-1',
      sendEmail: true,
    })

    expect(result).toEqual({
      success: false,
      refused: 'full',
      seatsTaken: 30,
      capacity: 30,
      after: 31,
      message: 'Full (30 of 30). Confirming goes 1 past capacity.',
    })
    expect(seats.confirmSignups).toHaveBeenCalledWith(
      'w-1',
      'conf-A',
      ['s-1'],
      {
        acceptSeats: undefined,
      },
    )
    expect(sendBasicWorkshopConfirmation).not.toHaveBeenCalled()
  })

  it('with an accepted count: passes it on, and still says it went beyond capacity', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([row('s-1', 'w-1')])
    seats.confirmSignups.mockResolvedValue({
      confirmed: ['s-1'],
      newlyConfirmed: ['s-1'],
      seatsTaken: 31,
      capacity: 30,
    })

    const result = await admin().confirmSignup({
      signupId: 's-1',
      sendEmail: false,
      acceptSeats: 31,
    })

    expect(seats.confirmSignups).toHaveBeenCalledWith(
      'w-1',
      'conf-A',
      ['s-1'],
      {
        acceptSeats: 31,
      },
    )
    expect(result.message).toBe(
      'Participant confirmed beyond capacity (31 of 30 seats)',
    )
  })
  it('confirmed from the waitlist without an email: does not say one was sent', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([row('s-1', 'w-1')])
    seats.confirmSignups.mockResolvedValue({
      confirmed: ['s-1'],
      newlyConfirmed: ['s-1'],
      seatsTaken: 2,
      capacity: 5,
    })

    const result = await admin().confirmSignup({
      signupId: 's-1',
      sendEmail: false,
    })

    expect(result.message).toBe('Participant confirmed')
    expect(sendBasicWorkshopConfirmation).not.toHaveBeenCalled()
  })

  it('says so when it confirmed beyond capacity', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([row('s-1', 'w-1')])
    seats.confirmSignups.mockResolvedValue({
      confirmed: ['s-1'],
      newlyConfirmed: ['s-1'],
      seatsTaken: 6,
      capacity: 5,
    })

    const result = await admin().confirmSignup({
      signupId: 's-1',
      sendEmail: false,
    })

    expect(result.message).toBe(
      'Participant confirmed beyond capacity (6 of 5 seats)',
    )
  })

  it('confirmed already by the time of the write: not named beyond capacity, and no email', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([row('s-1', 'w-1')])
    seats.confirmSignups.mockResolvedValue({
      confirmed: ['s-1'],
      newlyConfirmed: [],
      seatsTaken: 6,
      capacity: 5,
    })

    const result = await admin().confirmSignup({
      signupId: 's-1',
      sendEmail: true,
    })

    expect(result.message).toBe('Workshop signup confirmed successfully')
    expect(sendBasicWorkshopConfirmation).not.toHaveBeenCalled()
  })

  it('busy: TOO_MANY_REQUESTS with a clear message', async () => {
    ws.getAllWorkshopSignups.mockResolvedValue([row('s-1', 'w-1')])
    seats.confirmSignups.mockResolvedValue({ refused: 'busy' })

    await expect(
      admin().confirmSignup({ signupId: 's-1', sendEmail: false }),
    ).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message:
        'Many people are signing up for this workshop right now. Nothing was saved. Try again in a moment.',
    })
  })
})

describe('admin.updateCapacity', () => {
  it.each([
    [
      { refused: 'below-seats-taken', seatsTaken: 7 },
      'CONFLICT',
      'Cannot reduce capacity below current signup count (7)',
    ],
    [
      { refused: 'not-found' },
      'NOT_FOUND',
      'Workshop not found for this conference',
    ],
    [
      { refused: 'busy' },
      'TOO_MANY_REQUESTS',
      'Many people are signing up for this workshop right now. Nothing was saved. Try again in a moment.',
    ],
  ])('refused %o: %s', async (answer, code, message) => {
    seats.changeCapacity.mockResolvedValue(answer)

    await expect(
      admin().updateCapacity({ workshopId: 'w-1', capacity: 5 }),
    ).rejects.toMatchObject({ code, message })
  })

  it('a failed read of the promoted sign-ups does not fail the saved change', async () => {
    seats.changeCapacity.mockResolvedValue({ promoted: ['s-1'] })
    ws.getAllWorkshopSignups.mockRejectedValue(new Error('503: unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await admin().updateCapacity({
      workshopId: 'w-1',
      capacity: 5,
    })

    expect(result).toMatchObject({ success: true, promotedCount: 1 })
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('promotion emails not sent'),
      ['s-1'],
      expect.any(Error),
    )
  })

  it('a failed re-read of the workshop after the change still emails the promoted, and succeeds', async () => {
    seats.changeCapacity.mockResolvedValue({ promoted: ['s-1'] })
    ws.getAllWorkshopSignups.mockResolvedValue([row('s-1', 'w-1', 'confirmed')])
    ws.getWorkshopById.mockRejectedValue(new Error('503: unavailable'))

    const result = await admin().updateCapacity({
      workshopId: 'w-1',
      capacity: 5,
    })

    expect(result).toMatchObject({ success: true, promotedCount: 1 })
    expect(sendBasicWorkshopConfirmation).toHaveBeenCalledTimes(1)
  })

  it('a failed email is logged with the sign-up it was for, and only that one', async () => {
    seats.changeCapacity.mockResolvedValue({ promoted: ['s-1', 's-2'] })
    ws.getAllWorkshopSignups.mockResolvedValue([
      row('s-1', 'w-1', 'confirmed'),
      row('s-2', 'w-1', 'confirmed'),
    ])
    vi.mocked(sendBasicWorkshopConfirmation)
      .mockResolvedValueOnce({ data: { emailId: 'e-1' } } as never)
      .mockResolvedValueOnce({ error: { message: 'provider down' } } as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await admin().updateCapacity({ workshopId: 'w-1', capacity: 5 })

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('promotion emails not sent'),
      ['s-2'],
      [{ message: 'provider down' }],
    )
  })

  it('a conference that could not be read: no email in a fallback name, and the sign-ups are logged', async () => {
    seats.changeCapacity.mockResolvedValue({ promoted: ['s-1'] })
    ws.getAllWorkshopSignups.mockResolvedValue([row('s-1', 'w-1', 'confirmed')])
    const { getConferenceForCurrentDomain } =
      await import('@/lib/conference/sanity')
    // The read's own fallback, for the emails' read (the admin check's read,
    // made without options, goes through): a conference, with the error.
    const read = vi.mocked(getConferenceForCurrentDomain)
    const usual = read.getMockImplementation()!
    read.mockImplementation(async (options?: unknown) =>
      options
        ? ({
            conference: { _id: 'conf-A', organization: { _ref: 'org-A' } },
            domain: 'localhost',
            error: new Error('503'),
          } as never)
        : usual(),
    )
    vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await admin().updateCapacity({ workshopId: 'w-1', capacity: 5 })
    } finally {
      read.mockImplementation(usual)
    }

    expect(sendBasicWorkshopConfirmation).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('promotion emails not sent'),
      ['s-1'],
      expect.anything(),
    )
  })

  it('does not email a promoted sign-up moved back to the waitlist meanwhile, though a read still shows it confirmed', async () => {
    seats.changeCapacity.mockResolvedValue({ promoted: ['s-1', 's-2'] })
    ws.getAllWorkshopSignups.mockResolvedValue([
      row('s-1', 'w-1', 'confirmed'),
      row('s-2', 'w-1', 'confirmed'),
    ])
    current.status['s-2'] = 'waitlist'

    await admin().updateCapacity({ workshopId: 'w-1', capacity: 5 })

    expect(
      vi
        .mocked(sendBasicWorkshopConfirmation)
        .mock.calls.map(([to]) => to.userEmail),
    ).toEqual(['s-1@example.com'])
  })

  it('emails each promoted sign-up and counts them', async () => {
    seats.changeCapacity.mockResolvedValue({ promoted: ['s-1', 's-2'] })
    ws.getAllWorkshopSignups.mockResolvedValue([
      row('s-1', 'w-1', 'confirmed'),
      row('s-2', 'w-1', 'confirmed'),
    ])

    const result = await admin().updateCapacity({
      workshopId: 'w-1',
      capacity: 5,
    })

    expect(seats.changeCapacity).toHaveBeenCalledWith('w-1', 'conf-A', 5)
    expect(ws.getAllWorkshopSignups).toHaveBeenCalledWith(
      expect.objectContaining({
        conferenceId: 'conf-A',
        signupIds: ['s-1', 's-2'],
      }),
    )
    expect(result.promotedCount).toBe(2)
    expect(sendBasicWorkshopConfirmation).toHaveBeenCalledTimes(2)
  })
})
