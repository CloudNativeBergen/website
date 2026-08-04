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

import {
  bulkUpdateSponsors,
  bulkDeleteSponsors,
  BulkTenancyError,
} from '@/lib/sponsor-crm/bulk'
import { clientWrite } from '@/lib/sanity/client'

/** The conference every fixture below belongs to. */
const CONF = 'conf-ours'

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
      ;(clientWrite.fetch as any).mockResolvedValue(mockSponsors)
      const tx = createMockTransaction()
      ;(clientWrite.transaction as any).mockReturnValue(tx)

      const result = await bulkUpdateSponsors(
        { ids: ['s1', 's2'], status: 'contacted' },
        mockUserId,
        CONF,
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
      ;(clientWrite.fetch as any).mockResolvedValue([
        { _id: 's1', _type: 'sponsorForConference', tags: ['warm-lead'] },
      ])
      const tx = createMockTransaction()
      ;(clientWrite.transaction as any).mockReturnValue(tx)

      await bulkUpdateSponsors(
        { ids: ['s1'], addTags: ['high-priority'], removeTags: ['warm-lead'] },
        mockUserId,
        CONF,
      )

      expect(tx.patch).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ set: { tags: ['high-priority'] } }),
      )
    })

    it('deduplicates tags when adding existing ones', async () => {
      ;(clientWrite.fetch as any).mockResolvedValue([
        {
          _id: 's1',
          _type: 'sponsorForConference',
          tags: ['warm-lead', 'high-priority'],
        },
      ])
      const tx = createMockTransaction()
      ;(clientWrite.transaction as any).mockReturnValue(tx)

      await bulkUpdateSponsors(
        { ids: ['s1'], addTags: ['warm-lead', 'referral'] },
        mockUserId,
        CONF,
      )

      expect(tx.patch).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({
          set: { tags: ['warm-lead', 'high-priority', 'referral'] },
        }),
      )
    })

    it('does not create activity log when status is unchanged', async () => {
      ;(clientWrite.fetch as any).mockResolvedValue([
        { _id: 's1', _type: 'sponsorForConference', status: 'contacted' },
      ])
      const tx = createMockTransaction()
      ;(clientWrite.transaction as any).mockReturnValue(tx)

      await bulkUpdateSponsors(
        { ids: ['s1'], status: 'contacted' },
        mockUserId,
        CONF,
      )

      // patch is called (status field is set) but no activity log created
      expect(tx.patch).toHaveBeenCalled()
      expect(tx.create).not.toHaveBeenCalled()
    })

    it('propagates transaction commit failures', async () => {
      ;(clientWrite.fetch as any).mockResolvedValue([
        { _id: 's1', _type: 'sponsorForConference', status: 'prospect' },
      ])
      const tx = createMockTransaction()
      tx.commit.mockRejectedValue(new Error('Transaction failed'))
      ;(clientWrite.transaction as any).mockReturnValue(tx)

      await expect(
        bulkUpdateSponsors(
          { ids: ['s1'], status: 'contacted' },
          mockUserId,
          CONF,
        ),
      ).rejects.toThrow('Transaction failed')
    })

    it('resolves assignee name for activity logs', async () => {
      ;(clientWrite.fetch as any)
        .mockResolvedValueOnce([
          { _id: 's1', _type: 'sponsorForConference', status: 'prospect' },
        ])
        .mockResolvedValueOnce({ name: 'Jane Doe' })
      const tx = createMockTransaction()
      ;(clientWrite.transaction as any).mockReturnValue(tx)

      await bulkUpdateSponsors(
        { ids: ['s1'], assignedTo: 'user-jane' },
        mockUserId,
        CONF,
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
      ;(clientWrite.fetch as any)
        .mockResolvedValueOnce(['s1', 's2']) // ownership probe
        .mockResolvedValueOnce(['activity-1', 'activity-2'])
      const tx = createMockTransaction()
      ;(clientWrite.transaction as any).mockReturnValue(tx)

      const result = await bulkDeleteSponsors(['s1', 's2'], CONF)

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
      ;(clientWrite.fetch as any)
        .mockResolvedValueOnce(['s1']) // ownership probe
        .mockResolvedValueOnce(['activity-1'])
        .mockResolvedValueOnce(['asset-pdf-1', 'asset-pdf-2'])
        .mockResolvedValueOnce(['asset-pdf-1', 'asset-pdf-2'])
      const tx = createMockTransaction()
      ;(clientWrite.transaction as any).mockReturnValue(tx)

      await bulkDeleteSponsors(['s1'], CONF, { deleteContractAssets: true })

      expect(tx.delete).toHaveBeenCalledWith('s1')
      expect(tx.delete).toHaveBeenCalledWith('activity-1')
      expect(tx.delete).toHaveBeenCalledWith('asset-pdf-1')
      expect(tx.delete).toHaveBeenCalledWith('asset-pdf-2')
    })

    it('does not fetch contract assets when deleteContractAssets is false', async () => {
      ;(clientWrite.fetch as any)
        .mockResolvedValueOnce(['s1']) // ownership probe
        .mockResolvedValueOnce([])
      const tx = createMockTransaction()
      ;(clientWrite.transaction as any).mockReturnValue(tx)

      await bulkDeleteSponsors(['s1'], CONF)

      // ownership probe + activity cascade only
      expect(clientWrite.fetch).toHaveBeenCalledTimes(2)
    })

    it('propagates transaction commit failures', async () => {
      ;(clientWrite.fetch as any)
        .mockResolvedValueOnce(['s1'])
        .mockResolvedValueOnce([])
      const tx = createMockTransaction()
      tx.commit.mockRejectedValue(new Error('Delete failed'))
      ;(clientWrite.transaction as any).mockReturnValue(tx)

      await expect(bulkDeleteSponsors(['s1'], CONF)).rejects.toThrow(
        'Delete failed',
      )
    })
  })

  // -------------------------------------------------------------------------
  // TENANCY REGRESSIONS. `ids` is CLIENT INPUT; these assert the batch is
  // refused AND that the fail-closed path issues no query and no write.
  // MUTATION CHECK: delete the `assertAllOwned(...)` call in
  // `bulkUpdateSponsors` and "refuses the WHOLE batch…" fails; delete the
  // `conferenceId` guard and the "issues NO query" tests fail; drop the
  // `scopedFetch` scope and the "binds the conference predicate" tests fail.
  // -------------------------------------------------------------------------
  describe('tenant scoping (#616/#730 write class)', () => {
    it('bulkUpdateSponsors binds the conference predicate into the read', async () => {
      ;(clientWrite.fetch as any).mockResolvedValue([
        { _id: 's1', _type: 'sponsorForConference', status: 'prospect' },
      ])
      ;(clientWrite.transaction as any).mockReturnValue(createMockTransaction())

      await bulkUpdateSponsors(
        { ids: ['s1'], status: 'contacted' },
        mockUserId,
        CONF,
      )

      const [query, params] = (clientWrite.fetch as any).mock.calls[0]
      expect(query).toContain('conference._ref == $conferenceId')
      expect(params).toMatchObject({ ids: ['s1'], conferenceId: CONF })
    })

    it('bulkUpdateSponsors refuses the WHOLE batch when an id is not in this conference', async () => {
      // The scoped read resolves only OUR id; `s-theirs` belongs to another
      // tenant (or does not exist) and therefore does not come back.
      ;(clientWrite.fetch as any).mockResolvedValue([
        { _id: 's1', _type: 'sponsorForConference', status: 'prospect' },
      ])
      const tx = createMockTransaction()
      ;(clientWrite.transaction as any).mockReturnValue(tx)

      await expect(
        bulkUpdateSponsors(
          { ids: ['s1', 's-theirs'], status: 'contacted' },
          mockUserId,
          CONF,
        ),
      ).rejects.toBeInstanceOf(BulkTenancyError)

      // Not even the owned subset is written: all or nothing.
      expect(tx.patch).not.toHaveBeenCalled()
      expect(tx.commit).not.toHaveBeenCalled()
    })

    it('bulkUpdateSponsors issues NO query and NO write without a conference', async () => {
      const tx = createMockTransaction()
      ;(clientWrite.transaction as any).mockReturnValue(tx)

      await expect(
        bulkUpdateSponsors(
          { ids: ['s1'], status: 'contacted' },
          mockUserId,
          '',
        ),
      ).rejects.toThrow(/without a resolved conference/)

      expect(clientWrite.fetch).not.toHaveBeenCalled()
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })

    it('bulkDeleteSponsors binds the conference predicate into the ownership probe', async () => {
      ;(clientWrite.fetch as any)
        .mockResolvedValueOnce(['s1'])
        .mockResolvedValueOnce([])
      ;(clientWrite.transaction as any).mockReturnValue(createMockTransaction())

      await bulkDeleteSponsors(['s1'], CONF)

      const [query, params] = (clientWrite.fetch as any).mock.calls[0]
      expect(query).toContain('conference._ref == $conferenceId')
      expect(params).toMatchObject({ ids: ['s1'], conferenceId: CONF })
    })

    it('bulkDeleteSponsors refuses the WHOLE batch and deletes NOTHING when an id is foreign', async () => {
      // Only `s1` resolves inside the conference.
      ;(clientWrite.fetch as any).mockResolvedValueOnce(['s1'])
      const tx = createMockTransaction()
      ;(clientWrite.transaction as any).mockReturnValue(tx)

      await expect(
        bulkDeleteSponsors(['s1', 's-theirs'], CONF),
      ).rejects.toBeInstanceOf(BulkTenancyError)

      expect(tx.delete).not.toHaveBeenCalled()
      expect(tx.commit).not.toHaveBeenCalled()
      // The cascade reads never ran either — refusal happens before them.
      expect(clientWrite.fetch).toHaveBeenCalledTimes(1)
    })

    it('bulkDeleteSponsors cascades off the RESOLVED ids, never the client list', async () => {
      ;(clientWrite.fetch as any)
        .mockResolvedValueOnce(['s1'])
        .mockResolvedValueOnce([])
      ;(clientWrite.transaction as any).mockReturnValue(createMockTransaction())

      await bulkDeleteSponsors(['s1'], CONF)

      const [cascadeQuery, cascadeParams] = (clientWrite.fetch as any).mock
        .calls[1]
      expect(cascadeQuery).toContain(
        'sponsorForConference->conference._ref == $conferenceId',
      )
      expect(cascadeParams).toMatchObject({ ids: ['s1'], conferenceId: CONF })
    })

    it('bulkDeleteSponsors issues NO query and NO delete without a conference', async () => {
      const tx = createMockTransaction()
      ;(clientWrite.transaction as any).mockReturnValue(tx)

      await expect(bulkDeleteSponsors(['s1'], '')).rejects.toThrow(
        /without a resolved conference/,
      )

      expect(clientWrite.fetch).not.toHaveBeenCalled()
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })
  })
})
