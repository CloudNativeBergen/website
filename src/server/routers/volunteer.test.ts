import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'
import { Occupation } from '@/lib/volunteer/types'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

// Volunteer data layer — only the pieces admin.update touches.
const getVolunteerByIdMock = vi.fn()
const updateVolunteerDetailsMock = vi.fn()
vi.mock('@/lib/volunteer/sanity', () => ({
  getVolunteersByConference: vi.fn(),
  getVolunteerById: (...a: unknown[]) => getVolunteerByIdMock(...a),
  updateVolunteerStatus: vi.fn(),
  updateVolunteerDetails: (...a: unknown[]) => updateVolunteerDetailsMock(...a),
  deleteVolunteer: vi.fn(),
  createVolunteer: vi.fn(),
}))

import { volunteerRouter } from './volunteer'

function makeCaller(isOrganizer = true) {
  const speaker = { _id: 'sp-1', name: 'Org', isOrganizer }
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
