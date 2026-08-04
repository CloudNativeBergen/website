import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

const { mockUncachedFetch, mockCreate, mockDelete, mockPatch, patchChain } =
  vi.hoisted(() => {
    const mockUncachedFetch = vi.fn()
    const mockCreate = vi.fn()
    const mockDelete = vi.fn()
    const patchChain = {
      ifRevisionId: vi.fn(),
      set: vi.fn(),
      commit: vi.fn(),
    }
    patchChain.ifRevisionId.mockReturnValue(patchChain)
    patchChain.set.mockReturnValue(patchChain)
    const mockPatch = vi.fn().mockReturnValue(patchChain)
    return { mockUncachedFetch, mockCreate, mockDelete, mockPatch, patchChain }
  })

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: mockUncachedFetch },
  clientReadCached: { fetch: vi.fn() },
  clientWrite: {
    // createOrReplace, not create: the write is idempotent per address now, so
    // two overlapping requests cannot leave two live links. Both are wired to
    // the same spy so the existing assertions keep describing "the document
    // that was written".
    create: mockCreate,
    createOrReplace: mockCreate,
    delete: mockDelete,
    patch: mockPatch,
  },
}))

import {
  consumeStoredToken,
  createStoredToken,
  deleteExpiredEmailSignInTokens,
} from '@/lib/auth/email-link/store'
import { hashStoredToken, mintStoredToken } from '@/lib/auth/email-link/token'

const HOST = 'tenant-a.example.com'
const NOW = 1_700_000_000_000

describe('stored-tier token store', () => {
  let previousSecret: string | undefined

  beforeEach(() => {
    previousSecret = process.env.AUTH_SECRET
    process.env.AUTH_SECRET = 'test-auth-secret-value'
    vi.clearAllMocks()
    patchChain.ifRevisionId.mockReturnValue(patchChain)
    patchChain.set.mockReturnValue(patchChain)
    patchChain.commit.mockResolvedValue({})
    mockDelete.mockResolvedValue({ results: [] })
    mockCreate.mockResolvedValue({})
  })

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previousSecret
  })

  it('stores ONLY the hash, and replaces any outstanding link for the address', async () => {
    const raw = mintStoredToken()
    const ok = await createStoredToken({
      identifier: 'user@example.com',
      rawToken: raw,
      origin: HOST,
      expiresAt: new Date(NOW + 900_000),
    })

    expect(ok).toEqual({ ok: true })
    // One live link per address.
    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ identifier: 'user@example.com' }),
      }),
    )

    const doc = mockCreate.mock.calls[0][0]
    expect(doc.tokenHash).toBe(hashStoredToken(raw))
    expect(JSON.stringify(doc)).not.toContain(raw)
  })

  it('consumes a valid token exactly once (REUSE is refused)', async () => {
    const raw = mintStoredToken()
    mockUncachedFetch.mockResolvedValueOnce({
      _id: 'doc-1',
      _rev: 'rev-1',
      identifier: 'user@example.com',
      origin: HOST,
      expiresAt: new Date(NOW + 60_000).toISOString(),
    })

    const first = await consumeStoredToken(raw, NOW)
    expect(first).toEqual({
      ok: true,
      identifier: 'user@example.com',
      origin: HOST,
    })
    // The compare-and-swap is revision-conditioned.
    expect(patchChain.ifRevisionId).toHaveBeenCalledWith('rev-1')
    expect(patchChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ consumedAt: expect.any(String) }),
    )

    // Second attempt: the query filters `!defined(consumedAt)`, so nothing hits.
    mockUncachedFetch.mockResolvedValueOnce(null)
    expect(await consumeStoredToken(raw, NOW)).toEqual({
      ok: false,
      reason: 'not-found',
    })
  })

  it('lets exactly ONE of two concurrent redemptions win (revision race)', async () => {
    const raw = mintStoredToken()
    const doc = {
      _id: 'doc-1',
      _rev: 'rev-1',
      identifier: 'user@example.com',
      origin: HOST,
      expiresAt: new Date(NOW + 60_000).toISOString(),
    }
    // BOTH readers see the same unconsumed document — the exact interleaving
    // that a non-atomic consume would let redeem twice.
    mockUncachedFetch.mockResolvedValue(doc)

    let commits = 0
    patchChain.commit.mockImplementation(async () => {
      commits += 1
      if (commits > 1) {
        throw Object.assign(new Error('Revision mismatch'), {
          statusCode: 409,
        })
      }
      return {}
    })

    const [a, b] = await Promise.all([
      consumeStoredToken(raw, NOW),
      consumeStoredToken(raw, NOW),
    ])

    const winners = [a, b].filter((r) => r.ok)
    const losers = [a, b].filter((r) => !r.ok)
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    expect(losers[0]).toEqual({ ok: false, reason: 'race' })
  })

  it('REFUSES an expired document without consuming it', async () => {
    const raw = mintStoredToken()
    mockUncachedFetch.mockResolvedValueOnce({
      _id: 'doc-1',
      _rev: 'rev-1',
      identifier: 'user@example.com',
      origin: HOST,
      expiresAt: new Date(NOW - 1).toISOString(),
    })

    expect(await consumeStoredToken(raw, NOW)).toEqual({
      ok: false,
      reason: 'expired',
    })
    expect(mockPatch).not.toHaveBeenCalled()
  })

  it('reads UNCACHED — a CDN snapshot could serve a pre-consume document', async () => {
    mockUncachedFetch.mockResolvedValueOnce(null)
    await consumeStoredToken(mintStoredToken(), NOW)
    expect(mockUncachedFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      { cache: 'no-store' },
    )
  })

  it('fails closed when the read throws', async () => {
    mockUncachedFetch.mockRejectedValueOnce(new Error('sanity down'))
    expect(await consumeStoredToken(mintStoredToken(), NOW)).toEqual({
      ok: false,
      reason: 'error',
    })
  })

  it('reports a failed persist so no unusable link is mailed', async () => {
    mockCreate.mockRejectedValueOnce(new Error('write failed'))
    const result = await createStoredToken({
      identifier: 'user@example.com',
      rawToken: mintStoredToken(),
      origin: HOST,
      expiresAt: new Date(NOW + 900_000),
    })
    expect(result).toEqual({ ok: false })
  })

  it('purges expired documents on the cleanup pass', async () => {
    mockDelete.mockResolvedValueOnce({ results: [{ id: 'a' }, { id: 'b' }] })
    expect(await deleteExpiredEmailSignInTokens(NOW)).toEqual({ deleted: 2 })
  })
})

/**
 * Raised by two reviewers independently on #740. The old delete-then-create
 * with a random `_id` could not carry "one live link per address": two
 * overlapping requests both delete, then both create, and each resulting
 * document is independently redeemable by its own hash.
 */
describe('one live link per address, under concurrency', () => {
  let previousSecret: string | undefined

  beforeEach(() => {
    previousSecret = process.env.AUTH_SECRET
    process.env.AUTH_SECRET = 'test-auth-secret-value'
    vi.clearAllMocks()
    mockDelete.mockResolvedValue({ results: [] })
    mockCreate.mockResolvedValue({})
  })

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previousSecret
  })

  it('writes a per-address document id, so a later request overwrites', async () => {
    await createStoredToken({
      identifier: 'organizer@example.com',
      rawToken: 'sd1.aaa',
      origin: 'conf.example',
      expiresAt: new Date(Date.now() + 60_000),
    })
    await createStoredToken({
      identifier: 'organizer@example.com',
      rawToken: 'sd1.bbb',
      origin: 'conf.example',
      expiresAt: new Date(Date.now() + 60_000),
    })

    const first = mockCreate.mock.calls[0][0]._id
    const second = mockCreate.mock.calls[1][0]._id
    expect(first).toBe(second)
    // and it must not be the address in the clear — the id would otherwise be
    // an offline oracle for "does this person have an account here".
    expect(first).not.toContain('organizer@example.com')
  })

  it('gives different addresses different documents', async () => {
    await createStoredToken({
      identifier: 'a@example.com',
      rawToken: 'sd1.aaa',
      origin: 'conf.example',
      expiresAt: new Date(Date.now() + 60_000),
    })
    await createStoredToken({
      identifier: 'b@example.com',
      rawToken: 'sd1.bbb',
      origin: 'conf.example',
      expiresAt: new Date(Date.now() + 60_000),
    })

    expect(mockCreate.mock.calls[0][0]._id).not.toBe(
      mockCreate.mock.calls[1][0]._id,
    )
  })
})
