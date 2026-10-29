import { describe, it, expect, vi, beforeEach } from 'vitest'

const patch = {
  set: vi.fn(),
  setIfMissing: vi.fn(),
  unset: vi.fn(),
  ifRevisionId: vi.fn(),
  commit: vi.fn(),
}

const tx = { patch: vi.fn(), commit: vi.fn() }

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {},
  clientWrite: { patch: vi.fn(() => patch), transaction: vi.fn(() => tx) },
}))

import { updateVolunteerStatus, bulkUpdateVolunteerStatus } from './sanity'
import { VolunteerStatus } from './types'

describe('updateVolunteerStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    patch.set.mockReturnValue(patch)
    patch.setIfMissing.mockReturnValue(patch)
    patch.unset.mockReturnValue(patch)
    patch.commit.mockResolvedValue({})
  })

  it('keeps the original reviewer when confirming', async () => {
    await updateVolunteerStatus('vol-1', VolunteerStatus.CONFIRMED, 'org-2')

    const set = patch.set.mock.calls[0][0]
    expect(set).toMatchObject({ status: VolunteerStatus.CONFIRMED })
    expect(set.confirmedAt).toEqual(expect.any(String))
    expect(set).not.toHaveProperty('reviewedAt')
    expect(set).not.toHaveProperty('reviewedBy')
    expect(patch.setIfMissing).toHaveBeenCalledWith({
      reviewedAt: expect.any(String),
      reviewedBy: { _type: 'reference', _ref: 'org-2' },
    })
    expect(patch.unset).not.toHaveBeenCalled()
    expect(patch.commit).toHaveBeenCalledOnce()
  })

  it('records the reviewer and clears confirmedAt on other statuses', async () => {
    await updateVolunteerStatus('vol-1', VolunteerStatus.APPROVED, 'org-2')

    expect(patch.set.mock.calls[0][0]).toMatchObject({
      status: VolunteerStatus.APPROVED,
      reviewedBy: { _type: 'reference', _ref: 'org-2' },
    })
    expect(patch.setIfMissing).not.toHaveBeenCalled()
    expect(patch.unset).toHaveBeenCalledWith(['confirmedAt'])
  })

  it('keeps the reviewer when reverting confirmed to approved', async () => {
    await updateVolunteerStatus(
      'vol-1',
      VolunteerStatus.APPROVED,
      'org-2',
      undefined,
      true,
    )

    const set = patch.set.mock.calls[0][0]
    expect(set).toEqual({ status: VolunteerStatus.APPROVED })
    expect(patch.setIfMissing).toHaveBeenCalledOnce()
    expect(patch.unset).toHaveBeenCalledWith(['confirmedAt'])
  })
})

describe('bulkUpdateVolunteerStatus', () => {
  it('patches every id in one transaction with the reviewer', async () => {
    vi.clearAllMocks()
    patch.set.mockReturnValue(patch)
    patch.unset.mockReturnValue(patch)
    patch.ifRevisionId.mockReturnValue(patch)
    tx.commit.mockResolvedValue({})
    const res = await bulkUpdateVolunteerStatus(
      [
        { _id: 'v1', _rev: 'r1' },
        { _id: 'v2', _rev: 'r2' },
      ],
      VolunteerStatus.APPROVED,
      'org-2',
    )
    expect(res).toEqual({ success: true, error: null })
    expect(tx.patch.mock.calls.map((c) => c[0])).toEqual(['v1', 'v2'])
    tx.patch.mock.calls[0][1](patch)
    expect(patch.ifRevisionId).toHaveBeenCalledWith('r1')
    expect(patch.set).toHaveBeenCalledWith({
      status: VolunteerStatus.APPROVED,
      reviewedAt: expect.any(String),
      reviewedBy: { _type: 'reference', _ref: 'org-2' },
    })
    expect(patch.unset).toHaveBeenCalledWith(['confirmedAt'])
    expect(tx.commit).toHaveBeenCalledOnce()
  })
})
