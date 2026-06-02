import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockCreate, mockTransaction, mockCommit } = vi.hoisted(() => {
  const mockCreate = vi.fn()
  const mockCommit = vi.fn()
  const mockTransaction = vi.fn(() => ({
    create: mockCreate,
    commit: mockCommit,
  }))
  return { mockCreate, mockTransaction, mockCommit }
})

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    create: mockCreate.mockResolvedValue({ _id: 'activity-1' }),
    transaction: mockTransaction,
  },
}))

vi.mock('@/lib/time', () => ({
  getCurrentDateTime: () => '2026-05-29T12:00:00Z',
}))

import {
  createSponsorActivity,
  logBulkEmailSent,
  deleteSponsorActivity,
} from '@/lib/sponsor-crm/activity'

const { mockFetch, mockDelete } = vi.hoisted(() => {
  return {
    mockFetch: vi.fn(),
    mockDelete: vi.fn(),
  }
})

vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    create: mockCreate.mockResolvedValue({ _id: 'activity-1' }),
    transaction: mockTransaction,
    fetch: mockFetch,
    delete: mockDelete,
  },
}))

describe('sponsor-crm activity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('deleteSponsorActivity', () => {
    it('should allow deleting a custom note by its creator', async () => {
      mockFetch.mockResolvedValueOnce({
        activityType: 'note',
        createdBy: { _ref: 'user-1' },
      })
      mockDelete.mockResolvedValueOnce({})

      const { success, error } = await deleteSponsorActivity(
        'activity-1',
        'user-1',
      )

      expect(success).toBe(true)
      expect(error).toBeUndefined()
      expect(mockDelete).toHaveBeenCalledWith('activity-1')
    })

    it('should reject deleting a system-generated activity', async () => {
      mockFetch.mockResolvedValueOnce({
        activityType: 'stage_change',
        createdBy: { _ref: 'user-1' },
      })

      const { success, error } = await deleteSponsorActivity(
        'activity-1',
        'user-1',
      )

      expect(success).toBe(false)
      expect(error?.message).toContain('Cannot delete system-generated')
      expect(mockDelete).not.toHaveBeenCalled()
    })

    it('should reject deleting an activity created by another user', async () => {
      mockFetch.mockResolvedValueOnce({
        activityType: 'note',
        createdBy: { _ref: 'user-other' },
      })

      const { success, error } = await deleteSponsorActivity(
        'activity-1',
        'user-1',
      )

      expect(success).toBe(false)
      expect(error?.message).toContain('only delete your own activities')
      expect(mockDelete).not.toHaveBeenCalled()
    })

    it('should return error if activity is not found', async () => {
      mockFetch.mockResolvedValueOnce(null)

      const { success, error } = await deleteSponsorActivity(
        'activity-1',
        'user-1',
      )

      expect(success).toBe(false)
      expect(error?.message).toContain('Activity not found')
    })
  })

  describe('createSponsorActivity', () => {
    it('should create a basic activity document', async () => {
      const { activityId, error } = await createSponsorActivity(
        'sfc-123',
        'note',
        'Test note',
        'speaker-456',
      )

      expect(error).toBeUndefined()
      expect(activityId).toBe('activity-1')
      expect(mockCreate).toHaveBeenCalledWith({
        _type: 'sponsorActivity',
        sponsorForConference: {
          _type: 'reference',
          _ref: 'sfc-123',
        },
        activityType: 'note',
        description: 'Test note',
        metadata: undefined,
        createdAt: '2026-05-29T12:00:00Z',
        createdBy: {
          _type: 'reference',
          _ref: 'speaker-456',
        },
      })
    })

    it('should create an activity with metadata', async () => {
      await createSponsorActivity(
        'sfc-123',
        'stage_change',
        'Moved to next stage',
        'speaker-456',
        { oldValue: 'prospect', newValue: 'contacted' },
      )

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { oldValue: 'prospect', newValue: 'contacted' },
        }),
      )
    })

    it('should omit createdBy when it is "system"', async () => {
      await createSponsorActivity('sfc-123', 'note', 'System action', 'system')

      const call = mockCreate.mock.calls[0][0]
      expect(call.createdBy).toBeUndefined()
    })

    it('should return error if creation fails', async () => {
      const sanityError = new Error('Sanity failed')
      mockCreate.mockRejectedValueOnce(sanityError)

      const { activityId, error } = await createSponsorActivity(
        'sfc-1',
        'note',
        'Broken',
        'speaker-1',
      )

      expect(activityId).toBeUndefined()
      expect(error).toBe(sanityError)
    })
  })

  describe('logBulkEmailSent', () => {
    it('should create multiple activities in a transaction', async () => {
      const { success } = await logBulkEmailSent(
        ['sfc-1', 'sfc-2'],
        'Test Subject',
        'speaker-1',
      )

      expect(success).toBe(true)
      expect(mockTransaction).toHaveBeenCalled()
      expect(mockCreate).toHaveBeenCalledTimes(2)
      expect(mockCommit).toHaveBeenCalled()

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          sponsorForConference: { _type: 'reference', _ref: 'sfc-1' },
          description: 'Broadcast email sent: Test Subject',
        }),
      )
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          sponsorForConference: { _type: 'reference', _ref: 'sfc-2' },
        }),
      )
    })
  })
})
