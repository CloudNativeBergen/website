/**
 * @vitest-environment node
 *
 * `workshop.admin.resendSignupInstructions` (#1298): the organizer's button
 * for mailing every workshop ticket holder the sign-up instructions with the
 * portal link, once the main host can sign in. The router, its organizer
 * waist and the workshops gate run for real; the conference/organization
 * documents and the resend itself (`resend-instructions.test.ts`) are the
 * boundaries.
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

const resend = vi.fn<(conference: unknown) => Promise<unknown>>()
vi.mock('@/lib/workshop/resend-instructions', () => ({
  resendWorkshopSignupInstructions: (conference: unknown) => resend(conference),
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
})

describe('workshop.admin.resendSignupInstructions', () => {
  it('resends for the domain conference and reports the counts', async () => {
    resend.mockResolvedValue({
      kind: 'sent',
      sent: 12,
      failed: 1,
      unconfirmed: 3,
    })

    await expect(caller().admin.resendSignupInstructions()).resolves.toEqual({
      sent: 12,
      failed: 1,
      unconfirmed: 3,
    })
    expect(resend).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'conf-1' }),
    )
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
      /ticket list could not be read/,
    ],
    [
      'rate-limited',
      { kind: 'rate-limited', retryAfterMs: 30 * 60 * 1000 },
      'TOO_MANY_REQUESTS',
      /30 minutes/,
    ],
  ])('answers %s as %s', async (_label, outcome, code, message) => {
    resend.mockResolvedValue(outcome)

    await expect(
      caller().admin.resendSignupInstructions(),
    ).rejects.toMatchObject({ code, message: expect.stringMatching(message) })
  })

  it('FORBIDs a tenant without workshops before anything is sent', async () => {
    mockGetOrganizationById.mockResolvedValue({
      _id: ORG_ID,
      name: 'Tenant A',
      slug: 'tenant-a',
      plan: 'community',
    })

    await expect(
      caller().admin.resendSignupInstructions(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(resend).not.toHaveBeenCalled()
  })

  it('refuses someone who is not an organizer of this conference', async () => {
    await expect(
      caller({
        _id: 'speaker-1',
        organizerOrgIds: [],
      }).admin.resendSignupInstructions(),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/FORBIDDEN|UNAUTHORIZED/),
    })
    expect(resend).not.toHaveBeenCalled()
  })
})
