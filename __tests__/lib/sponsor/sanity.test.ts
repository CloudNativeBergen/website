vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: vi.fn(),
    transaction: vi.fn(),
  },
}))

import { deleteSponsorTier } from '@/lib/sponsor/sanity'
import { clientWrite } from '@/lib/sanity/client'

const CONF = 'conf-ours'

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
    ;(clientWrite.fetch as any)
      .mockResolvedValueOnce('tier-1') // ownership probe
      .mockResolvedValueOnce(['sfc-1', 'sfc-2'])
    const tx = mockTransaction()

    const result = await deleteSponsorTier('tier-1', CONF)

    expect(result.error).toBeUndefined()
    expect(tx.patch).toHaveBeenCalledWith('sfc-1', { unset: ['tier'] })
    expect(tx.patch).toHaveBeenCalledWith('sfc-2', { unset: ['tier'] })
    expect(tx.delete).toHaveBeenCalledWith('tier-1')
    expect(tx.commit).toHaveBeenCalledTimes(1)
  })

  it('deletes the tier even when no sponsor references it', async () => {
    ;(clientWrite.fetch as any)
      .mockResolvedValueOnce('tier-1') // ownership probe
      .mockResolvedValueOnce([])
    const tx = mockTransaction()

    const result = await deleteSponsorTier('tier-1', CONF)

    expect(result.error).toBeUndefined()
    expect(tx.patch).not.toHaveBeenCalled()
    expect(tx.delete).toHaveBeenCalledWith('tier-1')
    expect(tx.commit).toHaveBeenCalledTimes(1)
  })

  it('returns an error when the transaction fails', async () => {
    ;(clientWrite.fetch as any)
      .mockResolvedValueOnce('tier-1') // ownership probe
      .mockResolvedValueOnce([])
    const tx = mockTransaction()
    tx.commit.mockRejectedValueOnce(new Error('boom'))

    const result = await deleteSponsorTier('tier-1', CONF)

    expect(result.error).toBeInstanceOf(Error)
  })

  // -------------------------------------------------------------------------
  // TENANCY REGRESSIONS. MUTATION CHECK: delete the `if (!owned)` refusal and
  // "refuses a tier from another conference" fails; delete the `!conferenceId`
  // guard and "issues NO query" fails.
  // -------------------------------------------------------------------------
  describe('tenant scoping (#616/#730 write class)', () => {
    it('binds the conference predicate into the ownership probe', async () => {
      ;(clientWrite.fetch as any)
        .mockResolvedValueOnce('tier-1')
        .mockResolvedValueOnce([])
      mockTransaction()

      await deleteSponsorTier('tier-1', CONF)

      const [query, params] = (clientWrite.fetch as any).mock.calls[0]
      expect(query).toContain('conference._ref == $conferenceId')
      expect(params).toMatchObject({ id: 'tier-1', conferenceId: CONF })
    })

    it('refuses a tier from another conference, and deletes nothing', async () => {
      // The scoped point read does not resolve a foreign tier.
      ;(clientWrite.fetch as any).mockResolvedValueOnce(null)
      const tx = mockTransaction()

      const result = await deleteSponsorTier('tier-theirs', CONF)

      expect(result.error?.message).toMatch(/not found in this conference/)
      expect(tx.patch).not.toHaveBeenCalled()
      expect(tx.delete).not.toHaveBeenCalled()
      expect(tx.commit).not.toHaveBeenCalled()
      // The cascade read never ran either.
      expect(clientWrite.fetch).toHaveBeenCalledTimes(1)
    })

    it('issues NO query and NO delete without a resolved conference', async () => {
      const tx = mockTransaction()

      const result = await deleteSponsorTier('tier-1', '')

      expect(result.error?.message).toMatch(/without a resolved conference/)
      expect(clientWrite.fetch).not.toHaveBeenCalled()
      expect(tx.delete).not.toHaveBeenCalled()
    })
  })
})
