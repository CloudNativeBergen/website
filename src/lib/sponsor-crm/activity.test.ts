import { describe, it, expect, vi, beforeEach } from 'vitest'

// Sanity write client: drive the pre-check fetch and capture the patch.
const fetchMock = vi.fn()
const commitMock = vi.fn()
const deleteMock = vi.fn()
let lastPatchId: string | undefined
const lastSets: Record<string, unknown>[] = []

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: (query: string, params?: Record<string, unknown>) =>
      fetchMock(query, params),
    delete: (id: string) => deleteMock(id),
    patch: (id: string) => {
      lastPatchId = id
      const builder = {
        set: (obj: Record<string, unknown>) => {
          lastSets.push(obj)
          return builder
        },
        commit: () => commitMock(),
      }
      return builder
    },
  },
}))

import { updateSponsorActivity, deleteSponsorActivity } from './activity'

const USER_ID = 'sp-1'

beforeEach(() => {
  vi.clearAllMocks()
  lastPatchId = undefined
  lastSets.length = 0
  commitMock.mockResolvedValue({})
  deleteMock.mockResolvedValue({})
})

describe('updateSponsorActivity — type + creator gating', () => {
  it('updates a user-authored activity owned by the caller', async () => {
    fetchMock.mockResolvedValue({
      activityType: 'note',
      createdBy: { _ref: USER_ID },
    })
    const result = await updateSponsorActivity('act-1', USER_ID, 'Updated note')
    expect(result.success).toBe(true)
    expect(lastPatchId).toBe('act-1')
    expect(lastSets[0]).toEqual({ description: 'Updated note' })
    expect(commitMock).toHaveBeenCalledOnce()
  })

  it('also patches metadata when provided', async () => {
    fetchMock.mockResolvedValue({
      activityType: 'call',
      createdBy: { _ref: USER_ID },
    })
    await updateSponsorActivity('act-1', USER_ID, 'Called', {
      additionalData: 'left voicemail',
    })
    expect(lastSets).toEqual([
      { description: 'Called' },
      { metadata: { additionalData: 'left voicemail' } },
    ])
  })

  it.each(['stage_change', 'invoice_status_change', 'contract_signed'])(
    'refuses to edit system-generated type: %s',
    async (activityType) => {
      fetchMock.mockResolvedValue({
        activityType,
        createdBy: { _ref: USER_ID },
      })
      const result = await updateSponsorActivity('act-1', USER_ID, 'x')
      expect(result.success).toBe(false)
      expect(result.error?.message).toMatch(/system-generated/i)
      expect(commitMock).not.toHaveBeenCalled()
    },
  )

  it('refuses to edit another user’s activity', async () => {
    fetchMock.mockResolvedValue({
      activityType: 'note',
      createdBy: { _ref: 'someone-else' },
    })
    const result = await updateSponsorActivity('act-1', USER_ID, 'x')
    expect(result.success).toBe(false)
    expect(result.error?.message).toMatch(/your own/i)
    expect(commitMock).not.toHaveBeenCalled()
  })

  it('404s when the activity does not exist', async () => {
    fetchMock.mockResolvedValue(null)
    const result = await updateSponsorActivity('missing', USER_ID, 'x')
    expect(result.success).toBe(false)
    expect(result.error?.message).toMatch(/not found/i)
  })
})

describe('deleteSponsorActivity — gating mirrors update', () => {
  it('deletes a user-authored activity owned by the caller', async () => {
    fetchMock.mockResolvedValue({
      activityType: 'meeting',
      createdBy: { _ref: USER_ID },
    })
    const result = await deleteSponsorActivity('act-1', USER_ID)
    expect(result.success).toBe(true)
    expect(deleteMock).toHaveBeenCalledWith('act-1')
  })

  it('refuses a system-generated type', async () => {
    fetchMock.mockResolvedValue({
      activityType: 'stage_change',
      createdBy: { _ref: USER_ID },
    })
    const result = await deleteSponsorActivity('act-1', USER_ID)
    expect(result.success).toBe(false)
    expect(deleteMock).not.toHaveBeenCalled()
  })
})
