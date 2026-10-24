import { describe, it, expect, vi, beforeEach } from 'vitest'

const patch = {
  set: vi.fn(),
  setIfMissing: vi.fn(),
  unset: vi.fn(),
  commit: vi.fn(),
}

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {},
  clientWrite: { patch: vi.fn(() => patch) },
}))

import { updateVolunteerStatus } from './sanity'
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
})
