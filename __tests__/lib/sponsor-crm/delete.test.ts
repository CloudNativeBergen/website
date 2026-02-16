vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: vi.fn(),
    transaction: vi.fn(() => ({
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockResolvedValue({}),
    })),
  },
  clientReadUncached: {
    fetch: vi.fn(),
  },
}))

import { deleteSponsorForConference } from '@/lib/sponsor-crm/sanity'
import { clientWrite } from '@/lib/sanity/client'

describe('deleteSponsorForConference', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes sponsor and related activities in a transaction', async () => {
    ;(clientWrite.fetch as any).mockResolvedValueOnce([
      'activity-1',
      'activity-2',
    ]) // related activities

    const mockTransaction = {
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockResolvedValue({}),
    }
    ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

    const result = await deleteSponsorForConference('sfc-1')

    expect(result.error).toBeUndefined()
    expect(mockTransaction.delete).toHaveBeenCalledWith('sfc-1')
    expect(mockTransaction.delete).toHaveBeenCalledWith('activity-1')
    expect(mockTransaction.delete).toHaveBeenCalledWith('activity-2')
    expect(mockTransaction.commit).toHaveBeenCalled()
  })

  it('deletes sponsor without activities when none exist', async () => {
    ;(clientWrite.fetch as any).mockResolvedValueOnce([]) // no activities

    const mockTransaction = {
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockResolvedValue({}),
    }
    ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

    const result = await deleteSponsorForConference('sfc-1')

    expect(result.error).toBeUndefined()
    expect(mockTransaction.delete).toHaveBeenCalledTimes(1)
    expect(mockTransaction.delete).toHaveBeenCalledWith('sfc-1')
  })

  it('deletes contract asset when deleteContractAsset option is true', async () => {
    ;(clientWrite.fetch as any)
      .mockResolvedValueOnce({
        contractDocument: { asset: { _ref: 'asset-pdf-1' } },
      }) // contract doc lookup
      .mockResolvedValueOnce(['asset-pdf-1']) // safety check: asset not referenced elsewhere
      .mockResolvedValueOnce([]) // no activities

    const mockTransaction = {
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockResolvedValue({}),
    }
    ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

    const result = await deleteSponsorForConference('sfc-1', {
      deleteContractAsset: true,
    })

    expect(result.error).toBeUndefined()
    expect(mockTransaction.delete).toHaveBeenCalledWith('sfc-1')
    expect(mockTransaction.delete).toHaveBeenCalledWith('asset-pdf-1')
  })

  it('skips asset deletion when no contract document exists', async () => {
    ;(clientWrite.fetch as any)
      .mockResolvedValueOnce(null) // no contract doc
      .mockResolvedValueOnce([]) // no activities

    const mockTransaction = {
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockResolvedValue({}),
    }
    ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

    const result = await deleteSponsorForConference('sfc-1', {
      deleteContractAsset: true,
    })

    expect(result.error).toBeUndefined()
    // Only sponsor deleted, no asset
    expect(mockTransaction.delete).toHaveBeenCalledTimes(1)
    expect(mockTransaction.delete).toHaveBeenCalledWith('sfc-1')
  })

  it('does not look up contract asset when option is not set', async () => {
    ;(clientWrite.fetch as any).mockResolvedValueOnce([]) // activities only

    const mockTransaction = {
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockResolvedValue({}),
    }
    ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

    await deleteSponsorForConference('sfc-1')

    // Only one fetch for activities, not for contract doc
    expect(clientWrite.fetch).toHaveBeenCalledTimes(1)
  })

  it('skips asset deletion when asset is referenced by other documents', async () => {
    ;(clientWrite.fetch as any)
      .mockResolvedValueOnce({
        contractDocument: { asset: { _ref: 'asset-shared' } },
      }) // contract doc lookup
      .mockResolvedValueOnce([]) // safety check: asset referenced elsewhere, not safe
      .mockResolvedValueOnce([]) // no activities

    const mockTransaction = {
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockResolvedValue({}),
    }
    ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

    const result = await deleteSponsorForConference('sfc-1', {
      deleteContractAsset: true,
    })

    expect(result.error).toBeUndefined()
    expect(mockTransaction.delete).toHaveBeenCalledTimes(1)
    expect(mockTransaction.delete).toHaveBeenCalledWith('sfc-1')
    expect(mockTransaction.delete).not.toHaveBeenCalledWith('asset-shared')
  })

  it('returns error when transaction fails', async () => {
    ;(clientWrite.fetch as any).mockResolvedValueOnce([])

    const mockTransaction = {
      delete: vi.fn().mockReturnThis(),
      // @ts-ignore
      commit: vi.fn().mockRejectedValue(new Error('Transaction failed')),
    }
    ;(clientWrite.transaction as any).mockReturnValue(mockTransaction)

    const result = await deleteSponsorForConference('sfc-1')

    expect(result.error).toBeDefined()
    expect(result.error?.message).toBe('Transaction failed')
  })
})
