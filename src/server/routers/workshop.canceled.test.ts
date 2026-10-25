/**
 * @vitest-environment node
 *
 * The organizer's actions on a canceled or withdrawn workshop: tell its
 * sign-ups (`notifyCanceled`) and move them to a listed one
 * (`moveCandidates`, `moveCanceledSignups`). The router, its organizer waist and the
 * workshops gate run for real (harness as in `workshop.reminder.test.ts`); the
 * Sanity reads and writes and the email send are the boundaries.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  stubOwnTicketingSecret,
  stubPlatformTicketingAccount,
} from '../../../__tests__/helpers/ticketingSecrets'

const mockGetOrganizationById = vi.fn()
const mockGetConference = vi.fn()
vi.mock('@/lib/organization/sanity', () => ({
  getOrganizationById: (...args: unknown[]) => mockGetOrganizationById(...args),
  getOrganizationRefForCurrentConference: () => null,
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...args: unknown[]) =>
    mockGetConference(...args),
}))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

const setPatch = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn(async () => null) },
  clientWrite: {
    patch: (id: string) => ({
      set: (fields: unknown) => {
        setPatch(id, fields)
        return { commit: async () => ({}) }
      },
      unset: (fields: unknown) => {
        setPatch(id, { unset: fields })
        return { commit: async () => ({}) }
      },
    }),
  },
}))

const rateLimit = vi.fn()
vi.mock('@/lib/workshop/announcementRateLimit', () => ({
  consumeAnnouncementRateLimit: (...a: unknown[]) => rateLimit(...a),
}))

const getCanceled = vi.fn()
const getSignups = vi.fn()
vi.mock('@/lib/workshop/sanity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workshop/sanity')>()),
  getCanceledWorkshopOf: (...a: unknown[]) => getCanceled(...a),
  getWorkshopSignupsByWorkshop: (...a: unknown[]) => getSignups(...a),
  getSignupsForHolderJoin: (...a: unknown[]) => holderJoin(...a),
  deleteWorkshopSignup: (...a: unknown[]) => deleteSignup(...a),
}))
const holderJoin = vi.fn()
const deleteSignup = vi.fn()

const getWorkshops = vi.fn()
vi.mock('@/lib/proposal/data/sanity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/proposal/data/sanity')>()),
  getWorkshops: (...a: unknown[]) => getWorkshops(...a),
}))

const signUp = vi.fn()
vi.mock('@/lib/workshop/seats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workshop/seats')>()),
  signUpForWorkshop: (...a: unknown[]) => signUp(...a),
  // The document store, as the move re-reads it.
  current: async (ids: string[], workshopId: string) =>
    ids
      .map((id) => stored.get(id))
      .filter((d) => d && d.workshop === workshopId),
}))
const stored = new Map<
  string,
  { _id: string; workshop: string; status: string; movedFromSignup?: string }
>()

const sendCanceled = vi.fn()
vi.mock('@/lib/email/workshop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email/workshop')>()),
  sendWorkshopCanceledEmail: (...a: unknown[]) => sendCanceled(...a),
}))

import { workshopRouter } from './workshop'
import { signupDocumentId } from '@/lib/workshop/seats'
import type { Context } from '@/server/trpc'

const ORG_ID = 'org-A'
const CONFERENCE = {
  _id: 'conf-1',
  title: 'CNDN',
  organization: { _ref: ORG_ID, _type: 'reference' },
}

function caller(
  speaker: Record<string, unknown> = {
    _id: 'organizer-1',
    organizerOrgIds: [ORG_ID],
  },
) {
  const session = { speaker, user: { email: 'organizer@example.test' } }
  return workshopRouter.createCaller({
    session,
    speaker,
    user: session.user,
  } as unknown as Context)
}

const signup = (id: string, status: string) => ({
  _id: id,
  userEmail: `${id}@example.test`,
  userName: id,
  status,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PLATFORM_ORG_ID', 'org-platform')
  stubPlatformTicketingAccount()
  stubOwnTicketingSecret(ORG_ID)
  mockGetConference.mockResolvedValue({ conference: CONFERENCE, error: null })
  mockGetOrganizationById.mockResolvedValue({
    _id: ORG_ID,
    name: 'Tenant A',
    slug: 'tenant-a',
    plan: 'pro',
  })
  getCanceled.mockResolvedValue({
    _id: 'ws-1',
    title: 'K8s Ops',
    status: 'canceled',
  })
  getSignups.mockResolvedValue([
    signup('a', 'confirmed'),
    signup('b', 'waitlist'),
    signup('c', 'cancelled'),
  ])
  sendCanceled.mockResolvedValue({ data: { emailId: 'e' } })
  rateLimit.mockReturnValue({ allowed: true, retryAfterMs: 0 })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('workshop.admin.notifyCanceled', () => {
  it('emails confirmed and waitlisted sign-ups with their own status, and stores when', async () => {
    // Stored before the first email goes out.
    sendCanceled.mockImplementation(async () => {
      expect(setPatch).toHaveBeenCalledTimes(1)
      return { data: { emailId: 'e' } }
    })
    const result = await caller().admin.notifyCanceled({
      workshopId: 'ws-1',
      message: '  Sorry.  ',
    })

    expect(getCanceled).toHaveBeenCalledWith('ws-1', 'conf-1')
    expect(
      sendCanceled.mock.calls.map(([r]) => [r.userEmail, r.status]),
    ).toEqual([
      ['a@example.test', 'confirmed'],
      ['b@example.test', 'waitlist'],
    ])
    expect(sendCanceled.mock.calls[0][0].message).toBe('Sorry.')
    expect(result).toMatchObject({ recipientCount: 2, sent: 2, failed: 0 })
    expect(rateLimit).toHaveBeenCalledWith('cancel-notice:ws-1')
    expect(setPatch).toHaveBeenLastCalledWith('ws-1', {
      workshopCancelNoticeSentAt: result.sentAt,
    })
  })

  it('counts a failed send and takes the stored time back when none went out', async () => {
    sendCanceled.mockResolvedValue({ error: { message: 'x' } })

    const result = await caller().admin.notifyCanceled({
      workshopId: 'ws-1',
      message: '',
    })

    expect(result).toMatchObject({ sent: 0, failed: 2, sentAt: null })
    expect(setPatch).toHaveBeenLastCalledWith('ws-1', {
      unset: ['workshopCancelNoticeSentAt'],
    })
  })

  it('keeps the earlier time when a second send reached no one', async () => {
    getCanceled.mockResolvedValue({
      _id: 'ws-1',
      title: 'K8s Ops',
      status: 'canceled',
      workshopCancelNoticeSentAt: '2026-10-01T10:00:00.000Z',
    })
    sendCanceled.mockResolvedValue({ error: { message: 'x' } })

    await caller().admin.notifyCanceled({ workshopId: 'ws-1', message: '' })

    expect(setPatch).toHaveBeenLastCalledWith('ws-1', {
      workshopCancelNoticeSentAt: '2026-10-01T10:00:00.000Z',
    })
  })

  it('refuses a send over the limit, and sends nothing', async () => {
    rateLimit.mockReturnValue({ allowed: false, retryAfterMs: 120_000 })

    await expect(
      caller().admin.notifyCanceled({ workshopId: 'ws-1', message: '' }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
    expect(sendCanceled).not.toHaveBeenCalled()
    expect(setPatch).not.toHaveBeenCalled()
  })

  it('refuses a workshop that is not canceled in this conference', async () => {
    getCanceled.mockResolvedValue(null)

    await expect(
      caller().admin.notifyCanceled({ workshopId: 'ws-2', message: '' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(sendCanceled).not.toHaveBeenCalled()
  })

  it('refuses someone who is not an organizer', async () => {
    await expect(
      caller({ _id: 'x', organizerOrgIds: [] }).admin.notifyCanceled({
        workshopId: 'ws-1',
        message: '',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(sendCanceled).not.toHaveBeenCalled()
  })
})

describe('moving the sign-ups of a canceled workshop', () => {
  const target = {
    _id: 'ws-2',
    title: 'Platform 101',
    capacity: 10,
    signups: 9,
    date: '2026-10-28',
    startTime: '10:00',
    endTime: '12:00',
  }
  const clash = {
    _id: 'ws-3',
    title: 'Clashing',
    date: '2026-10-28',
    startTime: '11:00',
    endTime: '13:00',
  }

  beforeEach(() => {
    getWorkshops.mockResolvedValue({
      workshops: [target, clash],
      workshopsError: null,
    })
    getSignups.mockResolvedValue([
      { ...signup('w', 'waitlist'), signedUpAt: '2026-01-01' },
      { ...signup('a', 'confirmed'), signedUpAt: '2026-01-02' },
      { ...signup('b', 'confirmed'), signedUpAt: '2026-01-01' },
      signup('x', 'cancelled'),
    ])
    holderJoin.mockResolvedValue([
      {
        userEmail: 'a@example.test',
        status: 'confirmed',
        workshop: { _id: 'ws-3' },
      },
      {
        userEmail: 'b@example.test',
        status: 'waitlist',
        workshop: { _id: 'ws-2' },
      },
    ])
    deleteSignup.mockImplementation(async (id: string) => {
      stored.delete(id)
    })
    stored.clear()
    for (const id of ['w', 'a', 'b'])
      stored.set(id, { _id: id, workshop: 'ws-1', status: 'confirmed' })
  })

  it('previews who is already in the target and who clashes in time', async () => {
    const preview = await caller().admin.moveCandidates({
      fromWorkshopId: 'ws-1',
      toWorkshopId: 'ws-2',
    })

    expect(preview.seatsFree).toBe(1)
    expect(
      preview.candidates.map((c) => [c.signupId, c.inTarget, c.conflict]),
    ).toEqual([
      ['b', true, null],
      ['a', false, 'Clashing'],
      ['w', false, null],
    ])
  })

  it('finds a person in the target by account, whatever email they used there', async () => {
    getSignups.mockResolvedValue([
      { ...signup('w', 'waitlist'), userWorkOSId: 'w-user' },
    ])
    holderJoin.mockResolvedValue([
      {
        userWorkOSId: 'w-user',
        userEmail: 'work@example.test',
        status: 'confirmed',
        workshop: { _id: 'ws-2' },
      },
    ])

    const preview = await caller().admin.moveCandidates({
      fromWorkshopId: 'ws-1',
      toWorkshopId: 'ws-2',
    })

    expect(preview.candidates[0].inTarget).toBe(true)
  })

  it('moves confirmed first, waitlists when full, skips those already in, and emails each moved', async () => {
    signUp.mockImplementation(async (req: { userWorkOSId: string }) =>
      req.userWorkOSId === 'b-user'
        ? { refused: 'already-signed-up' }
        : {
            signup: {
              status: signUp.mock.calls.length === 2 ? 'confirmed' : 'waitlist',
            },
          },
    )
    getSignups.mockResolvedValue(
      (await getSignups()).map((s: { _id: string }) => ({
        ...s,
        userWorkOSId: `${s._id}-user`,
      })),
    )

    const result = await caller().admin.moveCanceledSignups({
      fromWorkshopId: 'ws-1',
      toWorkshopId: 'ws-2',
    })

    expect(signUp.mock.calls.map(([r]) => r.workshopId)).toEqual([
      'ws-2',
      'ws-2',
      'ws-2',
    ])
    expect(signUp.mock.calls[0][1]).toEqual({ whenFull: 'waitlist' })
    expect(result).toEqual({
      confirmed: ['a'],
      waitlisted: ['w'],
      skipped: ['b'],
      gone: [],
      failed: [],
      emailFailed: [],
    })
    expect(deleteSignup.mock.calls.map(([id]) => id)).toEqual(['a', 'w'])
    expect(
      sendCanceled.mock.calls.map(([r]) => [r.userEmail, r.movedTo]),
    ).toEqual([
      [
        'a@example.test',
        { workshopTitle: 'Platform 101', status: 'confirmed' },
      ],
      ['w@example.test', { workshopTitle: 'Platform 101', status: 'waitlist' }],
    ])
  })

  it('leaves alone a sign-up deleted since the dialog read it, and emails no one about it', async () => {
    stored.delete('a')
    signUp.mockResolvedValue({ signup: { status: 'confirmed' } })

    const result = await caller().admin.moveCanceledSignups({
      fromWorkshopId: 'ws-1',
      toWorkshopId: 'ws-2',
      signupIds: ['a'],
    })

    expect(result.gone).toEqual(['a'])
    expect(signUp).not.toHaveBeenCalled()
    expect(sendCanceled).not.toHaveBeenCalled()
  })

  it('a retry after a failed delete finishes the move, with one email', async () => {
    getSignups.mockResolvedValue([
      { ...signup('a', 'confirmed'), userWorkOSId: 'a-user' },
    ])
    const targetId = signupDocumentId('conf-1', 'ws-2', 'a-user')
    signUp.mockImplementation(async (req: { movedFromSignup: string }) => {
      if (stored.has(targetId)) return { refused: 'already-signed-up' }
      stored.set(targetId, {
        _id: targetId,
        workshop: 'ws-2',
        status: 'confirmed',
        movedFromSignup: req.movedFromSignup,
      })
      return { signup: { status: 'confirmed' } }
    })
    deleteSignup.mockRejectedValueOnce(new Error('503'))
    const move = () =>
      caller().admin.moveCanceledSignups({
        fromWorkshopId: 'ws-1',
        toWorkshopId: 'ws-2',
      })

    expect(await move()).toMatchObject({ failed: ['a'], confirmed: [] })
    expect(sendCanceled).not.toHaveBeenCalled()

    expect(await move()).toMatchObject({ failed: [], confirmed: ['a'] })
    expect(stored.has('a')).toBe(false)
    expect(sendCanceled).toHaveBeenCalledTimes(1)
  })

  it('skips a person who signed up for the target on their own', async () => {
    getSignups.mockResolvedValue([
      { ...signup('a', 'confirmed'), userWorkOSId: 'a-user' },
    ])
    const targetId = signupDocumentId('conf-1', 'ws-2', 'a-user')
    stored.set(targetId, {
      _id: targetId,
      workshop: 'ws-2',
      status: 'waitlist',
    })
    signUp.mockResolvedValue({ refused: 'already-signed-up' })

    const result = await caller().admin.moveCanceledSignups({
      fromWorkshopId: 'ws-1',
      toWorkshopId: 'ws-2',
    })

    expect(result.skipped).toEqual(['a'])
    expect(deleteSignup).not.toHaveBeenCalled()
    expect(sendCanceled).not.toHaveBeenCalled()
  })

  it('reports a person moved whose email failed', async () => {
    signUp.mockResolvedValue({ signup: { status: 'confirmed' } })
    sendCanceled.mockResolvedValue({ error: { message: 'x' } })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await caller().admin.moveCanceledSignups({
      fromWorkshopId: 'ws-1',
      toWorkshopId: 'ws-2',
      signupIds: ['w'],
    })

    expect(result).toMatchObject({ waitlisted: [], emailFailed: ['w'] })
    expect(result.confirmed).toEqual(['w'])
  })

  it('moves only the sign-ups asked for', async () => {
    signUp.mockResolvedValue({ signup: { status: 'confirmed' } })

    await caller().admin.moveCanceledSignups({
      fromWorkshopId: 'ws-1',
      toWorkshopId: 'ws-2',
      signupIds: ['w'],
    })

    expect(deleteSignup.mock.calls).toEqual([['w']])
  })

  it('refuses a source that is not canceled', async () => {
    getCanceled.mockResolvedValue(null)

    await expect(
      caller().admin.moveCanceledSignups({
        fromWorkshopId: 'ws-1',
        toWorkshopId: 'ws-2',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(signUp).not.toHaveBeenCalled()
  })

  it('refuses a target that is not listed in this conference', async () => {
    await expect(
      caller().admin.moveCanceledSignups({
        fromWorkshopId: 'ws-1',
        toWorkshopId: 'elsewhere',
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'The target is not a listed workshop of this conference',
    })
    expect(signUp).not.toHaveBeenCalled()
  })

  it('refuses someone who is not an organizer', async () => {
    await expect(
      caller({ _id: 'x', organizerOrgIds: [] }).admin.moveCanceledSignups({
        fromWorkshopId: 'ws-1',
        toWorkshopId: 'ws-2',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
