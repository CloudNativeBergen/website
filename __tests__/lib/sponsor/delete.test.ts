import { describe, it, expect, jest, beforeEach } from '@jest/globals'

jest.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: jest.fn(),
    transaction: jest.fn(() => ({
      delete: jest.fn().mockReturnThis(),
      // @ts-ignore
      commit: jest.fn().mockResolvedValue({}),
    })),
  },
}))

import { deleteSponsor } from '@/lib/sponsor/sanity'
import { clientWrite } from '@/lib/sanity/client'

describe('deleteSponsor', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('deletes sponsor and all related sponsorForConference, activities, and assets', async () => {
    ; (clientWrite.fetch as any)
      .mockResolvedValueOnce([
        { _id: 'sfc-1', contractAssetRef: 'asset-1' },
        { _id: 'sfc-2', contractAssetRef: undefined },
      ]) // sponsorForConference docs
      .mockResolvedValueOnce(['activity-1', 'activity-2']) // related activities
      .mockResolvedValueOnce(['asset-1']) // safe-to-delete assets

    const mockTransaction = {
      delete: jest.fn().mockReturnThis(),
      // @ts-ignore
      commit: jest.fn().mockResolvedValue({}),
    }
      ; (clientWrite.transaction as any).mockReturnValue(mockTransaction)

    const result = await deleteSponsor('sponsor-1')

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
    ; (clientWrite.fetch as any).mockResolvedValueOnce([]) // no SFC docs

    const mockTransaction = {
      delete: jest.fn().mockReturnThis(),
      // @ts-ignore
      commit: jest.fn().mockResolvedValue({}),
    }
      ; (clientWrite.transaction as any).mockReturnValue(mockTransaction)

    const result = await deleteSponsor('sponsor-1')

    expect(result.error).toBeUndefined()
    expect(mockTransaction.delete).toHaveBeenCalledTimes(1)
    expect(mockTransaction.delete).toHaveBeenCalledWith('sponsor-1')
  })

  it('does not fetch activities when no sponsorForConference records exist', async () => {
    ; (clientWrite.fetch as any).mockResolvedValueOnce([])

    const mockTransaction = {
      delete: jest.fn().mockReturnThis(),
      // @ts-ignore
      commit: jest.fn().mockResolvedValue({}),
    }
      ; (clientWrite.transaction as any).mockReturnValue(mockTransaction)

    await deleteSponsor('sponsor-1')

    // Only one fetch for SFC docs
    expect(clientWrite.fetch).toHaveBeenCalledTimes(1)
  })

  it('skips asset deletion when assets are referenced by other sponsors', async () => {
    ; (clientWrite.fetch as any)
      .mockResolvedValueOnce([
        { _id: 'sfc-1', contractAssetRef: 'asset-shared' },
      ]) // SFC docs
      .mockResolvedValueOnce([]) // no activities
      .mockResolvedValueOnce([]) // safety check: asset referenced elsewhere

    const mockTransaction = {
      delete: jest.fn().mockReturnThis(),
      // @ts-ignore
      commit: jest.fn().mockResolvedValue({}),
    }
      ; (clientWrite.transaction as any).mockReturnValue(mockTransaction)

    const result = await deleteSponsor('sponsor-1')

    expect(result.error).toBeUndefined()
    expect(mockTransaction.delete).toHaveBeenCalledWith('sponsor-1')
    expect(mockTransaction.delete).toHaveBeenCalledWith('sfc-1')
    expect(mockTransaction.delete).not.toHaveBeenCalledWith('asset-shared')
  })

  it('deduplicates contract asset references', async () => {
    ; (clientWrite.fetch as any)
      .mockResolvedValueOnce([
        { _id: 'sfc-1', contractAssetRef: 'asset-1' },
        { _id: 'sfc-2', contractAssetRef: 'asset-1' },
      ]) // same asset referenced twice
      .mockResolvedValueOnce([]) // no activities
      .mockResolvedValueOnce(['asset-1']) // safe to delete

    const mockTransaction = {
      delete: jest.fn().mockReturnThis(),
      // @ts-ignore
      commit: jest.fn().mockResolvedValue({}),
    }
      ; (clientWrite.transaction as any).mockReturnValue(mockTransaction)

    await deleteSponsor('sponsor-1')

    // Asset should only be deleted once
    const deleteCalls = (mockTransaction.delete as any).mock.calls.map(
      (c: any[]) => c[0],
    )
    expect(deleteCalls.filter((id: string) => id === 'asset-1')).toHaveLength(1)
  })

  it('returns error when transaction fails', async () => {
    ; (clientWrite.fetch as any).mockResolvedValueOnce([])

    const mockTransaction = {
      delete: jest.fn().mockReturnThis(),
      // @ts-ignore
      commit: jest.fn().mockRejectedValue(new Error('Transaction failed')),
    }
      ; (clientWrite.transaction as any).mockReturnValue(mockTransaction)

    const result = await deleteSponsor('sponsor-1')

    expect(result.error).toBeDefined()
    expect(result.error?.message).toBe('Transaction failed')
  })
})
