/**
 * @vitest-environment node
 *
 * The organizer's actions on a canceled or withdrawn workshop: tell its
 * sign-ups (`notifyCanceled`). The router, its organizer waist and the
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
    }),
  },
}))

const getCanceled = vi.fn()
const getSignups = vi.fn()
vi.mock('@/lib/workshop/sanity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workshop/sanity')>()),
  getCanceledWorkshopOf: (...a: unknown[]) => getCanceled(...a),
  getWorkshopSignupsByWorkshop: (...a: unknown[]) => getSignups(...a),
}))

const sendCanceled = vi.fn()
vi.mock('@/lib/email/workshop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email/workshop')>()),
  sendWorkshopCanceledEmail: (...a: unknown[]) => sendCanceled(...a),
}))

import { workshopRouter } from './workshop'
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
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('workshop.admin.notifyCanceled', () => {
  it('emails confirmed and waitlisted sign-ups with their own status, and stores when', async () => {
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
    expect(setPatch).toHaveBeenCalledWith('ws-1', {
      workshopCancelNoticeSentAt: result.sentAt,
    })
  })

  it('counts a failed send and stores nothing when none went out', async () => {
    sendCanceled.mockResolvedValue({ error: { message: 'x' } })

    const result = await caller().admin.notifyCanceled({
      workshopId: 'ws-1',
      message: '',
    })

    expect(result).toMatchObject({ sent: 0, failed: 2, sentAt: null })
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
