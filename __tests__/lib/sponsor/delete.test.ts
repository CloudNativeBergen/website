vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: vi.fn(),
    transaction: vi.fn(() => ({
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockResolvedValue({}),
    })),
  },
}))

import { deleteSponsor } from '@/lib/sponsor/sanity'
import { clientWrite } from '@/lib/sanity/client'

const ORG = 'org-ours'

/**
 * Prime the ownership probe that now runs BEFORE any cascade read. `linkedOrgs`
 * are the orgs reached through the sponsor's `sponsorForConference` links.
 */
function primeOwnership(
  sponsorOrg: string | null = ORG,
  linkedOrgs: (string | null)[] = [],
) {
  ;(clientWrite.fetch as any).mockResolvedValueOnce({ sponsorOrg, linkedOrgs })
}

describe('deleteSponsor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes sponsor and all related sponsorForConference, activities, and assets', async () => {
    primeOwnership()
    ;(clientWrite.fetch as any)
      .mockResolvedValueOnce([
        { _id: 'sfc-1', contractAssetRef: 'asset-1' },
        { _id: 'sfc-2', contractAssetRef: undefined },
      ]) // sponsorForConference docs
      .mockResolvedValueOnce(['activity-1', 'activity-2']) // related activities
      .mockResolvedValueOnce(['asset-1']) // safe-to-delete assets

    const mockTransaction = {
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockResolvedValue({}),
    }
    ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

    const result = await deleteSponsor('sponsor-1', ORG)

    expect(result.error).toBeUndefined()
    expect(mockTransaction.delete).toHaveBeenCalledWith('sponsor-1')
    expect(mockTransaction.delete).toHaveBeenCalledWith('sfc-1')
    expect(mockTransaction.delete).toHaveBeenCalledWith('sfc-2')
    expect(mockTransaction.delete).toHaveBeenCalledWith('activity-1')
    expect(mockTransaction.delete).toHaveBeenCalledWith('activity-2')
    expect(mockTransaction.delete).toHaveBeenCalledWith('asset-1')
    expect(mockTransaction.commit).toHaveBeenCalled()
  })

  it('deletes sponsor with no related records', async () => {
    primeOwnership()
    ;(clientWrite.fetch as any).mockResolvedValueOnce([]) // no SFC docs

    const mockTransaction = {
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockResolvedValue({}),
    }
    ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

    const result = await deleteSponsor('sponsor-1', ORG)

    expect(result.error).toBeUndefined()
    expect(mockTransaction.delete).toHaveBeenCalledTimes(1)
    expect(mockTransaction.delete).toHaveBeenCalledWith('sponsor-1')
  })

  it('does not fetch activities when no sponsorForConference records exist', async () => {
    primeOwnership()
    ;(clientWrite.fetch as any).mockResolvedValueOnce([])

    const mockTransaction = {
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockResolvedValue({}),
    }
    ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

    await deleteSponsor('sponsor-1', ORG)

    // Ownership probe + the SFC docs read; no activity cascade.
    expect(clientWrite.fetch).toHaveBeenCalledTimes(2)
  })

  it('skips asset deletion when assets are referenced by other sponsors', async () => {
    primeOwnership()
    ;(clientWrite.fetch as any)
      .mockResolvedValueOnce([
        { _id: 'sfc-1', contractAssetRef: 'asset-shared' },
      ]) // SFC docs
      .mockResolvedValueOnce([]) // no activities
      .mockResolvedValueOnce([]) // safety check: asset referenced elsewhere

    const mockTransaction = {
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockResolvedValue({}),
    }
    ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

    const result = await deleteSponsor('sponsor-1', ORG)

    expect(result.error).toBeUndefined()
    expect(mockTransaction.delete).toHaveBeenCalledWith('sponsor-1')
    expect(mockTransaction.delete).toHaveBeenCalledWith('sfc-1')
    expect(mockTransaction.delete).not.toHaveBeenCalledWith('asset-shared')
  })

  it('deduplicates contract asset references', async () => {
    primeOwnership()
    ;(clientWrite.fetch as any)
      .mockResolvedValueOnce([
        { _id: 'sfc-1', contractAssetRef: 'asset-1' },
        { _id: 'sfc-2', contractAssetRef: 'asset-1' },
      ]) // same asset referenced twice
      .mockResolvedValueOnce([]) // no activities
      .mockResolvedValueOnce(['asset-1']) // safe to delete

    const mockTransaction = {
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockResolvedValue({}),
    }
    ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

    await deleteSponsor('sponsor-1', ORG)

    // Asset should only be deleted once
    const deleteCalls = (mockTransaction.delete as any).mock.calls.map(
      (c: any[]) => c[0],
    )
    expect(deleteCalls.filter((id: string) => id === 'asset-1')).toHaveLength(1)
  })

  it('returns error when transaction fails', async () => {
    primeOwnership()
    ;(clientWrite.fetch as any).mockResolvedValueOnce([])

    const mockTransaction = {
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockRejectedValue(new Error('Transaction failed')),
    }
    ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

    const result = await deleteSponsor('sponsor-1', ORG)

    expect(result.error).toBeDefined()
    expect(result.error?.message).toBe('Transaction failed')
  })

  // -------------------------------------------------------------------------
  // TENANCY REGRESSIONS. The sponsor id is CLIENT INPUT and the cascade deletes
  // every linked `sponsorForConference`. MUTATION CHECK: delete the
  // `claimants.some(...)` refusal and "refuses a sponsor owned by another org"
  // fails; delete the `!orgId` guard and "issues NO query" fails.
  // -------------------------------------------------------------------------
  describe('tenant scoping (#616/#730 write class)', () => {
    it('refuses a sponsor owned by another org, and deletes nothing', async () => {
      primeOwnership('org-theirs')
      const mockTransaction = {
        delete: vi.fn().mockReturnThis(),
        // @ts-ignore
        commit: vi.fn().mockResolvedValue({}),
      }
      ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

      const result = await deleteSponsor('sponsor-theirs', ORG)

      expect(result.error?.message).toMatch(/not found in this organization/)
      expect(mockTransaction.delete).not.toHaveBeenCalled()
      expect(mockTransaction.commit).not.toHaveBeenCalled()
      // Only the probe ran — no cascade read reached another tenant's rows.
      expect(clientWrite.fetch).toHaveBeenCalledTimes(1)
    })

    it('refuses when ANY linked conference belongs to another org', async () => {
      // Backfill-independent arm: the sponsor doc itself has no org key, but it
      // is linked to a conference owned by someone else.
      primeOwnership(null, [ORG, 'org-theirs'])
      const mockTransaction = {
        delete: vi.fn().mockReturnThis(),
        // @ts-ignore
        commit: vi.fn().mockResolvedValue({}),
      }
      ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

      const result = await deleteSponsor('sponsor-shared', ORG)

      expect(result.error?.message).toMatch(/not found in this organization/)
      expect(mockTransaction.delete).not.toHaveBeenCalled()
    })

    it('refuses an unattributable sponsor (no org key, no links) — fails closed', async () => {
      primeOwnership(null, [])
      const mockTransaction = {
        delete: vi.fn().mockReturnThis(),
        // @ts-ignore
        commit: vi.fn().mockResolvedValue({}),
      }
      ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

      const result = await deleteSponsor('sponsor-orphan', ORG)

      expect(result.error?.message).toMatch(/not found in this organization/)
      expect(mockTransaction.delete).not.toHaveBeenCalled()
    })

    it('accepts a sponsor whose only claim comes through its linked conferences', async () => {
      primeOwnership(null, [ORG, ORG])
      ;(clientWrite.fetch as any).mockResolvedValueOnce([])
      const mockTransaction = {
        delete: vi.fn().mockReturnThis(),
        // @ts-ignore
        commit: vi.fn().mockResolvedValue({}),
      }
      ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

      const result = await deleteSponsor('sponsor-1', ORG)

      expect(result.error).toBeUndefined()
      expect(mockTransaction.delete).toHaveBeenCalledWith('sponsor-1')
    })

    it('issues NO query and NO delete without a resolved organization', async () => {
      const mockTransaction = {
        delete: vi.fn().mockReturnThis(),
        // @ts-ignore
        commit: vi.fn().mockResolvedValue({}),
      }
      ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

      const result = await deleteSponsor('sponsor-1', null)

      expect(result.error?.message).toMatch(/without a resolved organization/)
      expect(clientWrite.fetch).not.toHaveBeenCalled()
      expect(clientWrite.transaction).not.toHaveBeenCalled()
    })
  })
})
