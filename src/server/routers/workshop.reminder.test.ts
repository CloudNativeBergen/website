/**
 * @vitest-environment node
 *
 * `workshop.admin.sendReminder` (#1334): the organizer's reminder to the
 * workshop ticket holders who have not signed up, with an optional note. The
 * router, its input schema, its organizer waist and the workshops gate run for
 * real; the conference/organization documents and the send itself
 * (`reminder.test.ts`) are the boundaries.
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
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: vi.fn(async () => null) },
}))

const remind =
  vi.fn<
    (conference: unknown, options: unknown, now: number) => Promise<unknown>
  >()
vi.mock('@/lib/workshop/reminder', () => ({
  sendWorkshopReminder: (conference: unknown, options: unknown, now: number) =>
    remind(conference, options, now),
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

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
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
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('workshop.admin.sendReminder', () => {
  it('reminds for the domain conference with the note, and reports the counts and when', async () => {
    vi.setSystemTime(Date.parse('2026-10-10T12:00:00Z'))
    remind.mockResolvedValue({
      kind: 'sent',
      sent: 12,
      failed: 1,
      unconfirmed: 3,
    })

    await expect(
      caller().admin.sendReminder({ note: '  Bring a laptop.  ' }),
    ).resolves.toEqual({
      sent: 12,
      failed: 1,
      unconfirmed: 3,
      sentAt: '2026-10-10T12:00:00.000Z',
    })
    expect(remind).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'conf-1' }),
      { note: 'Bring a laptop.' },
      Date.parse('2026-10-10T12:00:00Z'),
    )
  })

  it('takes no note at all', async () => {
    remind.mockResolvedValue({
      kind: 'sent',
      sent: 1,
      failed: 0,
      unconfirmed: 0,
    })

    await caller().admin.sendReminder({})

    expect(remind).toHaveBeenCalledWith(
      expect.anything(),
      { note: undefined },
      expect.any(Number),
    )
  })

  it('takes a note of exactly 1,000 characters', async () => {
    remind.mockResolvedValue({
      kind: 'sent',
      sent: 1,
      failed: 0,
      unconfirmed: 0,
    })

    await caller().admin.sendReminder({ note: 'x'.repeat(1000) })

    expect(remind).toHaveBeenCalledWith(
      expect.anything(),
      { note: 'x'.repeat(1000) },
      expect.any(Number),
    )
  })

  it('refuses a note over 1,000 characters before anything is sent', async () => {
    await expect(
      caller().admin.sendReminder({ note: 'x'.repeat(1001) }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(remind).not.toHaveBeenCalled()
  })

  it.each([
    [
      'portal-unavailable',
      { kind: 'portal-unavailable' },
      'PRECONDITION_FAILED',
      /cannot sign in yet/,
    ],
    [
      'email-unavailable',
      { kind: 'email-unavailable' },
      'PRECONDITION_FAILED',
      /nothing was sent/,
    ],
    [
      'registration-closed',
      { kind: 'registration-closed' },
      'PRECONDITION_FAILED',
      /registration has closed/,
    ],
    [
      'ticketing-unavailable',
      { kind: 'ticketing-unavailable' },
      'PRECONDITION_FAILED',
      /ticket holders could not be read/,
    ],
    [
      'rate-limited',
      { kind: 'rate-limited', retryAfterMs: 30 * 60 * 1000 },
      'TOO_MANY_REQUESTS',
      /reminder went out less than an hour ago\. Try again in 30 minutes/,
    ],
  ])('answers %s as %s', async (_label, outcome, code, message) => {
    remind.mockResolvedValue(outcome)

    await expect(caller().admin.sendReminder({})).rejects.toMatchObject({
      code,
      message: expect.stringMatching(message),
    })
  })

  it('FORBIDs a tenant without workshops before anything is sent', async () => {
    mockGetOrganizationById.mockResolvedValue({
      _id: ORG_ID,
      name: 'Tenant A',
      slug: 'tenant-a',
      plan: 'community',
    })

    await expect(caller().admin.sendReminder({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(remind).not.toHaveBeenCalled()
  })

  it('refuses someone who is not an organizer of this conference', async () => {
    await expect(
      caller({
        _id: 'speaker-1',
        organizerOrgIds: [],
      }).admin.sendReminder({}),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/FORBIDDEN|UNAUTHORIZED/),
    })
    expect(remind).not.toHaveBeenCalled()
  })
})
