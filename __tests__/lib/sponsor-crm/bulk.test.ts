import { describe, it, expect, jest, beforeEach } from '@jest/globals'

// Mock clientWrite BEFORE importing the module that uses it
jest.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: jest.fn(),
    transaction: jest.fn(() => ({
      patch: jest.fn().mockReturnThis(),
      create: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      // @ts-ignore - Mocking commit which returns a promise
      commit: jest.fn().mockResolvedValue({}),
    })),
  },
}))

// Mock formatStatusName to avoid importing more dependencies that might break
jest.mock('@/components/admin/sponsor-crm/utils', () => ({
  formatStatusName: jest.fn((s) => s),
}))

import { bulkUpdateSponsors, bulkDeleteSponsors } from '@/lib/sponsor-crm/bulk'
import { clientWrite } from '@/lib/sanity/client'

describe('Bulk Sponsor CRM Operations', () => {
  const mockUserId = 'user-123'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('bulkUpdateSponsors', () => {
    it('correctly patches status and creates activity logs', async () => {
      const mockSponsors = [
        { _id: 's1', _type: 'sponsorForConference', status: 'prospect' },
        { _id: 's2', _type: 'sponsorForConference', status: 'prospect' },
      ]

      // @ts-ignore
      ;(clientWrite.fetch as any).mockResolvedValue(mockSponsors)

      const mockTransactionInstance = {
        patch: jest.fn().mockReturnThis(),
        create: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        // @ts-ignore
        commit: jest.fn().mockResolvedValue({}),
      }

      // @ts-ignore
      ;(clientWrite.transaction as any).mockReturnValue(mockTransactionInstance)

      const result = await bulkUpdateSponsors(
        { ids: ['s1', 's2'], status: 'contacted' },
        mockUserId,
      )

      expect(result.success).toBe(true)
      expect(result.updatedCount).toBe(2)

      // Verify patches
      expect(mockTransactionInstance.patch).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ set: { status: 'contacted' } }),
      )
      expect(mockTransactionInstance.patch).toHaveBeenCalledWith(
        's2',
        expect.objectContaining({ set: { status: 'contacted' } }),
      )

      // Verify activity logs
      expect(mockTransactionInstance.create).toHaveBeenCalledTimes(2)

      expect(mockTransactionInstance.commit).toHaveBeenCalled()
    })

    it('correctly handles tag additions and removals', async () => {
      const mockSponsors = [
        { _id: 's1', _type: 'sponsorForConference', tags: ['warm-lead'] },
      ]

      // @ts-ignore
      ;(clientWrite.fetch as any).mockResolvedValue(mockSponsors)
      const mockTransactionInstance = {
        patch: jest.fn().mockReturnThis(),
        create: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        // @ts-ignore
        commit: jest.fn().mockResolvedValue({}),
      }
      // @ts-ignore
      ;(clientWrite.transaction as any).mockReturnValue(mockTransactionInstance)

      await bulkUpdateSponsors(
        {
          ids: ['s1'],
          addTags: ['high-priority'],
          removeTags: ['warm-lead'],
        },
        mockUserId,
      )

      expect(mockTransactionInstance.patch).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({
          set: { tags: ['high-priority'] },
        }),
      )
    })
  })

  describe('bulkDeleteSponsors', () => {
    it('deletes sponsors and their related activities in a transaction', async () => {
      // Mock finding related activities
      // @ts-ignore
      ;(clientWrite.fetch as any).mockResolvedValue([
        'activity-1',
        'activity-2',
      ])

      const mockTransactionInstance = {
        patch: jest.fn().mockReturnThis(),
        create: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        // @ts-ignore
        commit: jest.fn().mockResolvedValue({}),
      }
      // @ts-ignore
      ;(clientWrite.transaction as any).mockReturnValue(mockTransactionInstance)

      const result = await bulkDeleteSponsors(['s1', 's2'])

      expect(result.success).toBe(true)
      expect(result.deletedCount).toBe(2)

      // Should delete the 2 sponsors
      expect(mockTransactionInstance.delete).toHaveBeenCalledWith('s1')
      expect(mockTransactionInstance.delete).toHaveBeenCalledWith('s2')

      // Should delete the 2 related activities
      expect(mockTransactionInstance.delete).toHaveBeenCalledWith('activity-1')
      expect(mockTransactionInstance.delete).toHaveBeenCalledWith('activity-2')

      expect(mockTransactionInstance.commit).toHaveBeenCalled()
    })

    it('deletes contract assets when deleteContractAssets option is true', async () => {
      // First fetch call returns activity IDs, second returns asset IDs
      ;(clientWrite.fetch as any)
        .mockResolvedValueOnce(['activity-1'])
        .mockResolvedValueOnce(['asset-pdf-1', 'asset-pdf-2'])

      const mockTransactionInstance = {
        patch: jest.fn().mockReturnThis(),
        create: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        // @ts-ignore
        commit: jest.fn().mockResolvedValue({}),
      }
      // @ts-ignore
      ;(clientWrite.transaction as any).mockReturnValue(mockTransactionInstance)

      const result = await bulkDeleteSponsors(['s1'], {
        deleteContractAssets: true,
      })

      expect(result.success).toBe(true)

      // Should delete sponsor, activity, and both contract assets
      expect(mockTransactionInstance.delete).toHaveBeenCalledWith('s1')
      expect(mockTransactionInstance.delete).toHaveBeenCalledWith('activity-1')
      expect(mockTransactionInstance.delete).toHaveBeenCalledWith('asset-pdf-1')
      expect(mockTransactionInstance.delete).toHaveBeenCalledWith('asset-pdf-2')
    })

    it('does not fetch contract assets when deleteContractAssets is false', async () => {
      // @ts-ignore
      ;(clientWrite.fetch as any).mockResolvedValue([])

      const mockTransactionInstance = {
        patch: jest.fn().mockReturnThis(),
        create: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        // @ts-ignore
        commit: jest.fn().mockResolvedValue({}),
      }
      // @ts-ignore
      ;(clientWrite.transaction as any).mockReturnValue(mockTransactionInstance)

      await bulkDeleteSponsors(['s1'])

      // Only one fetch call for activities, not a second for assets
      expect(clientWrite.fetch).toHaveBeenCalledTimes(1)
    })
  })
})
