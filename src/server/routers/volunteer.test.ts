import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'
import { Occupation } from '@/lib/volunteer/types'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

// adminProcedure resolves the REQUEST's org from the domain conference and grants
// only when the caller's `organizerOrgIds` contains it, so the domain conference
// has to point at the same org the caller below organizes.
vi.mock('@/lib/conference/sanity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getConferenceForCurrentDomain: async () => ({
    conference: {
      _id: 'conf-1',
      organization: { _type: 'reference', _ref: 'org-test' },
    },
    domain: 'localhost',
    error: null,
  }),
}))

// Volunteer data layer — only the pieces admin.update touches.
const getVolunteerByIdMock = vi.fn()
const updateVolunteerDetailsMock = vi.fn()
const confirmVolunteerAttendanceMock = vi.fn()
vi.mock('@/lib/volunteer/sanity', () => ({
  getVolunteersByConference: vi.fn(),
  getVolunteerById: (...a: unknown[]) => getVolunteerByIdMock(...a),
  updateVolunteerStatus: vi.fn(),
  updateVolunteerDetails: (...a: unknown[]) => updateVolunteerDetailsMock(...a),
  deleteVolunteer: vi.fn(),
  createVolunteer: vi.fn(),
  recordVolunteerApprovalEmailSent: vi
    .fn()
    .mockResolvedValue({ success: true, error: null }),
  confirmVolunteerAttendance: (...a: unknown[]) =>
    confirmVolunteerAttendanceMock(...a),
}))

// OWNERSHIP PROBE (#730): the volunteer mutations now resolve the target's
// conference before writing. Report it as belonging to this conference; the
// cross-tenant REFUSALS live in `tenancy.writes.test.ts`.
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string) =>
      query.includes('"memberOrgIds"')
        ? {
            _type: 'volunteer',
            orgId: null,
            conferenceId: 'conf-1',
            conferenceOrgId: 'org-test',
            memberOrgIds: [],
          }
        : null,
  },
  clientWrite: { patch: vi.fn(), delete: vi.fn(), create: vi.fn() },
}))

import { volunteerRouter } from './volunteer'
import { VolunteerStatus } from '@/lib/volunteer/types'
import { mintVolunteerConfirmToken } from '@/lib/volunteer/token'

function makeCaller(isOrganizer = true) {
  // `organizerOrgIds` — NOT the deprecated global `isOrganizer` flag — is what the
  // authz waist reads; it must contain the org the domain conference resolves to.
  const speaker = {
    _id: 'sp-1',
    name: 'Org',
    isOrganizer,
    organizerOrgIds: isOrganizer ? ['org-test'] : [],
  }
  const ctx = {
    session: { speaker, user: { name: 'Org' } },
    speaker,
  } as unknown as Context
  return volunteerRouter.createCaller(ctx)
}

const validInput = {
  volunteerId: 'vol-1',
  name: 'Ada',
  email: 'ada@example.com',
  phone: '+4711111111',
  occupation: Occupation.WORKING,
}

beforeEach(() => {
  vi.clearAllMocks()
  getVolunteerByIdMock.mockResolvedValue({
    volunteer: { _id: 'vol-1', name: 'Ada' },
    error: null,
  })
  updateVolunteerDetailsMock.mockResolvedValue({ success: true, error: null })
  confirmVolunteerAttendanceMock.mockResolvedValue({
    success: true,
    error: null,
  })
})

describe('volunteer.admin.update — authorization', () => {
  it('rejects a non-organizer (FORBIDDEN)', async () => {
    await expect(
      makeCaller(false).admin.update(validInput),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(updateVolunteerDetailsMock).not.toHaveBeenCalled()
  })
})

describe('volunteer.admin.update — behavior', () => {
  it('forwards the editable fields (minus volunteerId) to the data layer', async () => {
    const result = await makeCaller().admin.update({
      ...validInput,
      availability: 'weekends',
      preferredTasks: ['registration'],
      tshirtSize: null,
      dietaryRestrictions: null,
      otherInfo: null,
    })
    expect(result.success).toBe(true)
    expect(updateVolunteerDetailsMock).toHaveBeenCalledWith('vol-1', {
      name: 'Ada',
      email: 'ada@example.com',
      phone: '+4711111111',
      occupation: Occupation.WORKING,
      availability: 'weekends',
      preferredTasks: ['registration'],
      tshirtSize: null,
      dietaryRestrictions: null,
      otherInfo: null,
    })
  })

  it('404s when the volunteer does not exist', async () => {
    getVolunteerByIdMock.mockResolvedValue({ volunteer: null, error: null })
    await expect(makeCaller().admin.update(validInput)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(updateVolunteerDetailsMock).not.toHaveBeenCalled()
  })

  it('rejects a blank name (validation)', async () => {
    await expect(
      makeCaller().admin.update({ ...validInput, name: '' }),
    ).rejects.toBeTruthy()
    expect(updateVolunteerDetailsMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid email (validation)', async () => {
    await expect(
      makeCaller().admin.update({ ...validInput, email: 'not-an-email' }),
    ).rejects.toBeTruthy()
    expect(updateVolunteerDetailsMock).not.toHaveBeenCalled()
  })

  it('rejects more than 10 preferred tasks (validation)', async () => {
    await expect(
      makeCaller().admin.update({
        ...validInput,
        preferredTasks: Array.from({ length: 11 }, (_, i) => `task-${i}`),
      }),
    ).rejects.toBeTruthy()
    expect(updateVolunteerDetailsMock).not.toHaveBeenCalled()
  })
})

describe('volunteer.confirmAttendance', () => {
  it('confirms an approved volunteer with a valid token and returns registration links', async () => {
    const token = mintVolunteerConfirmToken({
      volunteerId: 'vol-1',
      conferenceId: 'conf-1',
      email: 'ada@example.com',
    })
    getVolunteerByIdMock.mockResolvedValue({
      volunteer: {
        _id: 'vol-1',
        name: 'Ada',
        email: 'ada@example.com',
        status: VolunteerStatus.APPROVED,
        conference: {
          _id: 'conf-1',
          title: 'Cloud Native Days Norway 2026',
          volunteerRegistrationLink: 'https://tickets.example.com/volunteer',
          volunteerSlackInviteUrl: 'https://slack.example.com/invite',
        },
      },
      error: null,
    })

    const result = await makeCaller(false).confirmAttendance({ token })
    expect(result).toMatchObject({
      status: VolunteerStatus.CONFIRMED,
      volunteerName: 'Ada',
      conferenceTitle: 'Cloud Native Days Norway 2026',
      registrationUrl: 'https://tickets.example.com/volunteer',
      slackInviteUrl: 'https://slack.example.com/invite',
    })
    expect(confirmVolunteerAttendanceMock).toHaveBeenCalledWith(
      'vol-1',
      expect.any(String),
    )
  })

  it('is idempotent when volunteer is already confirmed', async () => {
    const token = mintVolunteerConfirmToken({
      volunteerId: 'vol-1',
      conferenceId: 'conf-1',
      email: 'ada@example.com',
    })
    getVolunteerByIdMock.mockResolvedValue({
      volunteer: {
        _id: 'vol-1',
        name: 'Ada',
        email: 'ada@example.com',
        status: VolunteerStatus.CONFIRMED,
        confirmedAt: '2026-04-01T10:00:00Z',
        conference: {
          _id: 'conf-1',
          title: 'Cloud Native Days Norway 2026',
          volunteerRegistrationLink: 'https://tickets.example.com/volunteer',
          volunteerSlackInviteUrl: 'https://slack.example.com/invite',
        },
      },
      error: null,
    })

    const result = await makeCaller(false).confirmAttendance({ token })
    expect(result.status).toBe(VolunteerStatus.CONFIRMED)
    expect(result.confirmedAt).toBe('2026-04-01T10:00:00Z')
    expect(confirmVolunteerAttendanceMock).not.toHaveBeenCalled()
  })

  it('rejects a forged token before fetching any volunteer', async () => {
    await expect(
      makeCaller(false).confirmAttendance({ token: 'forged.signature' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Invalid confirmation link',
    })
    expect(getVolunteerByIdMock).not.toHaveBeenCalled()
    expect(confirmVolunteerAttendanceMock).not.toHaveBeenCalled()
  })

  it('rejects a non-approved (pending/rejected) volunteer', async () => {
    const token = mintVolunteerConfirmToken({
      volunteerId: 'vol-1',
      conferenceId: 'conf-1',
      email: 'ada@example.com',
    })
    getVolunteerByIdMock.mockResolvedValue({
      volunteer: {
        _id: 'vol-1',
        name: 'Ada',
        email: 'ada@example.com',
        status: VolunteerStatus.REJECTED,
        conference: { _id: 'conf-1', title: 'Conf' },
      },
      error: null,
    })

    await expect(
      makeCaller(false).confirmAttendance({ token }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Only approved volunteers can confirm attendance',
    })
    expect(confirmVolunteerAttendanceMock).not.toHaveBeenCalled()
  })

  it('rejects a token when the volunteer email was changed after minting', async () => {
    const token = mintVolunteerConfirmToken({
      volunteerId: 'vol-1',
      conferenceId: 'conf-1',
      email: 'old@example.com',
    })
    getVolunteerByIdMock.mockResolvedValue({
      volunteer: {
        _id: 'vol-1',
        name: 'Ada',
        email: 'new@example.com',
        status: VolunteerStatus.APPROVED,
        conference: { _id: 'conf-1', title: 'Conf' },
      },
      error: null,
    })

    await expect(
      makeCaller(false).confirmAttendance({ token }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Volunteer not found',
    })
    expect(confirmVolunteerAttendanceMock).not.toHaveBeenCalled()
  })
})
