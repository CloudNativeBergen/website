import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...a: unknown[]) => getConferenceMock(...a),
}))

const getVolunteersMock = vi.fn()
const bulkUpdateMock = vi.fn()
vi.mock('@/lib/volunteer/sanity', () => ({
  getVolunteersByConference: (...a: unknown[]) => getVolunteersMock(...a),
  bulkUpdateVolunteerStatus: (...a: unknown[]) => bulkUpdateMock(...a),
}))

import { volunteerRouter } from './volunteer'

const ORG_ID = 'org-A'
const conference = { _id: 'conf-1', organization: { _ref: ORG_ID } }

function caller() {
  const speaker = { _id: 'sp-1', name: 'S', organizerOrgIds: [ORG_ID] }
  return volunteerRouter.createCaller({
    session: { speaker, user: { name: 'S' } },
    speaker,
  } as unknown as Context)
}

beforeEach(() => {
  vi.clearAllMocks()
  getConferenceMock.mockResolvedValue({ conference, error: null })
  getVolunteersMock.mockResolvedValue({
    volunteers: [
      { _id: 'v1', _rev: 'r1', status: 'pending' },
      { _id: 'v2', _rev: 'r2', status: 'pending' },
      { _id: 'v3', _rev: 'r3', status: 'approved' },
    ],
    error: null,
  })
  bulkUpdateMock.mockResolvedValue({ success: true, error: null })
})

describe('volunteer.admin.bulkUpdateStatus', () => {
  it('refuses the batch if any id is outside the conference', async () => {
    await expect(
      caller().admin.bulkUpdateStatus({
        volunteerIds: ['v1', 'foreign'],
        status: 'approved' as never,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(getVolunteersMock).toHaveBeenCalledWith('conf-1')
    expect(bulkUpdateMock).not.toHaveBeenCalled()
  })

  it('writes pending ones in one call and skips the rest', async () => {
    const res = await caller().admin.bulkUpdateStatus({
      volunteerIds: ['v1', 'v2', 'v3'],
      status: 'rejected' as never,
    })
    expect(res).toEqual({ updated: 2, skipped: 1 })
    expect(bulkUpdateMock).toHaveBeenCalledOnce()
    expect(bulkUpdateMock).toHaveBeenCalledWith(
      [
        { _id: 'v1', _rev: 'r1' },
        { _id: 'v2', _rev: 'r2' },
      ],
      'rejected',
      'sp-1',
    )
  })

  it('does not write when nothing is pending', async () => {
    const res = await caller().admin.bulkUpdateStatus({
      volunteerIds: ['v3'],
      status: 'approved' as never,
    })
    expect(res).toEqual({ updated: 0, skipped: 1 })
    expect(bulkUpdateMock).not.toHaveBeenCalled()
  })

  it('dedupes ids before counting skipped', async () => {
    const res = await caller().admin.bulkUpdateStatus({
      volunteerIds: ['v1', 'v1', 'v3', 'v3'],
      status: 'approved' as never,
    })
    expect(res).toEqual({ updated: 1, skipped: 1 })
  })

  it('reports a revision conflict as CONFLICT', async () => {
    bulkUpdateMock.mockResolvedValue({
      success: false,
      error: Object.assign(new Error('rev mismatch'), { statusCode: 409 }),
    })
    await expect(
      caller().admin.bulkUpdateStatus({
        volunteerIds: ['v1'],
        status: 'approved' as never,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Someone else changed these volunteers, reload and try again',
    })
  })

  it('rejects more than 50 ids', async () => {
    await expect(
      caller().admin.bulkUpdateStatus({
        volunteerIds: Array.from({ length: 51 }, (_, i) => `v${i}`),
        status: 'approved' as never,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})
