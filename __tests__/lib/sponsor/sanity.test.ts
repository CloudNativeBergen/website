vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: vi.fn(),
    transaction: vi.fn(),
  },
}))

import { deleteSponsorTier } from '@/lib/sponsor/sanity'
import { clientWrite } from '@/lib/sanity/client'

describe('deleteSponsorTier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockTransaction() {
    const tx = {
      patch: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      commit: vi.fn().mockResolvedValue({}),
    }
    ;(clientWrite.transaction as any).mockReturnValue(tx)
    return tx
  }

  it('unsets the tier on referencing sponsors and deletes the tier in one transaction', async () => {
    ;(clientWrite.fetch as any).mockResolvedValueOnce(['sfc-1', 'sfc-2'])
    const tx = mockTransaction()

    const result = await deleteSponsorTier('tier-1')

    expect(result.error).toBeUndefined()
    expect(tx.patch).toHaveBeenCalledWith('sfc-1', { unset: ['tier'] })
    expect(tx.patch).toHaveBeenCalledWith('sfc-2', { unset: ['tier'] })
    expect(tx.delete).toHaveBeenCalledWith('tier-1')
    expect(tx.commit).toHaveBeenCalledTimes(1)
  })

  it('deletes the tier even when no sponsor references it', async () => {
    ;(clientWrite.fetch as any).mockResolvedValueOnce([])
    const tx = mockTransaction()

    const result = await deleteSponsorTier('tier-1')

    expect(result.error).toBeUndefined()
    expect(tx.patch).not.toHaveBeenCalled()
    expect(tx.delete).toHaveBeenCalledWith('tier-1')
    expect(tx.commit).toHaveBeenCalledTimes(1)
  })

  it('returns an error when the transaction fails', async () => {
    ;(clientWrite.fetch as any).mockResolvedValueOnce([])
    const tx = mockTransaction()
    tx.commit.mockRejectedValueOnce(new Error('boom'))

    const result = await deleteSponsorTier('tier-1')

    expect(result.error).toBeInstanceOf(Error)
  })
})
