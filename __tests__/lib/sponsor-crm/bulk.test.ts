// Mock clientWrite BEFORE importing the module that uses it
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: vi.fn(),
    transaction: vi.fn(() => ({
      patch: vi.fn().mockReturnThis(),
      create: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore - Mocking commit which returns a promise
      commit: vi.fn().mockResolvedValue({}),
    })),
  },
}))

import { bulkUpdateSponsors, bulkDeleteSponsors } from '@/lib/sponsor-crm/bulk'
import { clientWrite } from '@/lib/sanity/client'

function createMockTransaction() {
  return {
    patch: vi.fn().mockReturnThis(),
    create: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    // @ts-ignore
    commit: vi.fn().mockResolvedValue({}),
  }
}

describe('Bulk Sponsor CRM Operations', () => {
  const mockUserId = 'user-123'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('bulkUpdateSponsors', () => {
    it('patches status and creates activity logs for each sponsor', async () => {
      const mockSponsors = [
        { _id: 's1', _type: 'sponsorForConference', status: 'prospect' },
        { _id: 's2', _type: 'sponsorForConference', status: 'prospect' },
      ]
        ; (clientWrite.fetch as any).mockResolvedValue(mockSponsors)
      const tx = createMockTransaction()
        ; (clientWrite.transaction as any).mockReturnValue(tx)

      const result = await bulkUpdateSponsors(
        { ids: ['s1', 's2'], status: 'contacted' },
        mockUserId,
      )

      expect(result).toEqual({
        success: true,
        updatedCount: 2,
        totalCount: 2,
      })
      expect(tx.patch).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ set: { status: 'contacted' } }),
      )
      expect(tx.patch).toHaveBeenCalledWith(
        's2',
        expect.objectContaining({ set: { status: 'contacted' } }),
      )
      expect(tx.create).toHaveBeenCalledTimes(2)
      expect(tx.commit).toHaveBeenCalled()
    })

    it('handles tag additions and removals', async () => {
      ; (clientWrite.fetch as any).mockResolvedValue([
        { _id: 's1', _type: 'sponsorForConference', tags: ['warm-lead'] },
      ])
      const tx = createMockTransaction()
        ; (clientWrite.transaction as any).mockReturnValue(tx)

      await bulkUpdateSponsors(
        { ids: ['s1'], addTags: ['high-priority'], removeTags: ['warm-lead'] },
        mockUserId,
      )

      expect(tx.patch).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ set: { tags: ['high-priority'] } }),
      )
    })

    it('deduplicates tags when adding existing ones', async () => {
      ; (clientWrite.fetch as any).mockResolvedValue([
        {
          _id: 's1',
          _type: 'sponsorForConference',
          tags: ['warm-lead', 'high-priority'],
        },
      ])
      const tx = createMockTransaction()
        ; (clientWrite.transaction as any).mockReturnValue(tx)

      await bulkUpdateSponsors(
        { ids: ['s1'], addTags: ['warm-lead', 'referral'] },
        mockUserId,
      )

      expect(tx.patch).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({
          set: { tags: ['warm-lead', 'high-priority', 'referral'] },
        }),
      )
    })

    it('skips commit when no sponsors match the IDs', async () => {
      ; (clientWrite.fetch as any).mockResolvedValue([])
      const tx = createMockTransaction()
        ; (clientWrite.transaction as any).mockReturnValue(tx)

      const result = await bulkUpdateSponsors(
        { ids: ['nonexistent'], status: 'contacted' },
        mockUserId,
      )

      expect(result.updatedCount).toBe(0)
      expect(tx.commit).not.toHaveBeenCalled()
    })

    it('does not create activity log when status is unchanged', async () => {
      ; (clientWrite.fetch as any).mockResolvedValue([
        { _id: 's1', _type: 'sponsorForConference', status: 'contacted' },
      ])
      const tx = createMockTransaction()
        ; (clientWrite.transaction as any).mockReturnValue(tx)

      await bulkUpdateSponsors({ ids: ['s1'], status: 'contacted' }, mockUserId)

      // patch is called (status field is set) but no activity log created
      expect(tx.patch).toHaveBeenCalled()
      expect(tx.create).not.toHaveBeenCalled()
    })

    it('propagates transaction commit failures', async () => {
      ; (clientWrite.fetch as any).mockResolvedValue([
        { _id: 's1', _type: 'sponsorForConference', status: 'prospect' },
      ])
      const tx = createMockTransaction()
      tx.commit.mockRejectedValue(new Error('Transaction failed'))
        ; (clientWrite.transaction as any).mockReturnValue(tx)

      await expect(
        bulkUpdateSponsors({ ids: ['s1'], status: 'contacted' }, mockUserId),
      ).rejects.toThrow('Transaction failed')
    })

    it('resolves assignee name for activity logs', async () => {
      ; (clientWrite.fetch as any)
        .mockResolvedValueOnce([
          { _id: 's1', _type: 'sponsorForConference', status: 'prospect' },
        ])
        .mockResolvedValueOnce({ name: 'Jane Doe' })
      const tx = createMockTransaction()
        ; (clientWrite.transaction as any).mockReturnValue(tx)

      await bulkUpdateSponsors(
        { ids: ['s1'], assignedTo: 'user-jane' },
        mockUserId,
      )

      expect(tx.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('Jane Doe'),
        }),
      )
    })
  })

  describe('bulkDeleteSponsors', () => {
    it('deletes sponsors and their related activities', async () => {
      ; (clientWrite.fetch as any).mockResolvedValue([
        'activity-1',
        'activity-2',
      ])
      const tx = createMockTransaction()
        ; (clientWrite.transaction as any).mockReturnValue(tx)

      const result = await bulkDeleteSponsors(['s1', 's2'])

      expect(result).toEqual({
        success: true,
        deletedCount: 2,
        totalCount: 2,
      })
      expect(tx.delete).toHaveBeenCalledWith('s1')
      expect(tx.delete).toHaveBeenCalledWith('s2')
      expect(tx.delete).toHaveBeenCalledWith('activity-1')
      expect(tx.delete).toHaveBeenCalledWith('activity-2')
      expect(tx.commit).toHaveBeenCalled()
    })

    it('deletes contract assets when deleteContractAssets option is true', async () => {
      ; (clientWrite.fetch as any)
        .mockResolvedValueOnce(['activity-1'])
        .mockResolvedValueOnce(['asset-pdf-1', 'asset-pdf-2'])
        .mockResolvedValueOnce(['asset-pdf-1', 'asset-pdf-2'])
      const tx = createMockTransaction()
        ; (clientWrite.transaction as any).mockReturnValue(tx)

      await bulkDeleteSponsors(['s1'], { deleteContractAssets: true })

      expect(tx.delete).toHaveBeenCalledWith('s1')
      expect(tx.delete).toHaveBeenCalledWith('activity-1')
      expect(tx.delete).toHaveBeenCalledWith('asset-pdf-1')
      expect(tx.delete).toHaveBeenCalledWith('asset-pdf-2')
    })

    it('does not fetch contract assets when deleteContractAssets is false', async () => {
      ; (clientWrite.fetch as any).mockResolvedValue([])
      const tx = createMockTransaction()
        ; (clientWrite.transaction as any).mockReturnValue(tx)

      await bulkDeleteSponsors(['s1'])

      expect(clientWrite.fetch).toHaveBeenCalledTimes(1)
    })

    it('propagates transaction commit failures', async () => {
      ; (clientWrite.fetch as any).mockResolvedValue([])
      const tx = createMockTransaction()
      tx.commit.mockRejectedValue(new Error('Delete failed'))
        ; (clientWrite.transaction as any).mockReturnValue(tx)

      await expect(bulkDeleteSponsors(['s1'])).rejects.toThrow('Delete failed')
    })
  })
})
