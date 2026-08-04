import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

const { mockUncachedFetch, mockCreateOrReplace, mockDelete } = vi.hoisted(
  () => ({
    mockUncachedFetch: vi.fn(),
    mockCreateOrReplace: vi.fn(),
    mockDelete: vi.fn(),
  }),
)

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: mockUncachedFetch },
  clientReadCached: { fetch: vi.fn() },
  clientWrite: { createOrReplace: mockCreateOrReplace, delete: mockDelete },
}))

import {
  checkEmailLinkRateLimit,
  clientIpFromHeaders,
  deleteExpiredEmailSignInRateLimits,
} from '@/lib/auth/email-link/rateLimit'

const NOW = 1_700_000_000_000
const MIN = 60_000

/**
 * An in-memory stand-in for the Sanity bucket documents, so a test can drive a
 * real sequence of requests through the read-modify-write path.
 */
function withBucketStore() {
  const store = new Map<string, { hits: number[] }>()
  mockUncachedFetch.mockImplementation(
    async (_query: string, params: { id: string }) =>
      store.has(params.id) ? { _id: params.id, ...store.get(params.id) } : null,
  )
  mockCreateOrReplace.mockImplementation(
    async (doc: { _id: string; hits: number[] }) => {
      store.set(doc._id, { hits: doc.hits })
      return doc
    },
  )
  return store
}

describe('email sign-in rate limiting', () => {
  let previousSecret: string | undefined

  beforeEach(() => {
    previousSecret = process.env.AUTH_SECRET
    process.env.AUTH_SECRET = 'test-auth-secret-value'
    vi.clearAllMocks()
    mockDelete.mockResolvedValue({ results: [] })
  })

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = previousSecret
  })

  it('enforces the 60-second per-address cooldown', async () => {
    withBucketStore()
    const email = 'user@example.com'

    expect(await checkEmailLinkRateLimit({ normalizedEmail: email, now: NOW }))
      .toEqual({ allowed: true })

    // Immediately again: refused by the cooldown rule.
    expect(
      await checkEmailLinkRateLimit({ normalizedEmail: email, now: NOW + 1_000 }),
    ).toEqual({ allowed: false, scope: 'email' })

    // After the cooldown: allowed again.
    expect(
      await checkEmailLinkRateLimit({ normalizedEmail: email, now: NOW + 61_000 }),
    ).toEqual({ allowed: true })
  })

  it('caps an address at 3 requests per 15 minutes', async () => {
    withBucketStore()
    const email = 'user@example.com'
    // Space requests past the cooldown so only the 15-minute rule can bite.
    for (const offset of [0, 2 * MIN, 4 * MIN]) {
      expect(
        await checkEmailLinkRateLimit({
          normalizedEmail: email,
          now: NOW + offset,
        }),
      ).toEqual({ allowed: true })
    }

    expect(
      await checkEmailLinkRateLimit({
        normalizedEmail: email,
        now: NOW + 6 * MIN,
      }),
    ).toEqual({ allowed: false, scope: 'email' })

    // Once the window has rolled past the earliest hits, requests resume.
    expect(
      await checkEmailLinkRateLimit({
        normalizedEmail: email,
        now: NOW + 20 * MIN,
      }),
    ).toEqual({ allowed: true })
  })

  it('keeps separate buckets per address', async () => {
    withBucketStore()
    await checkEmailLinkRateLimit({ normalizedEmail: 'a@example.com', now: NOW })
    expect(
      await checkEmailLinkRateLimit({
        normalizedEmail: 'b@example.com',
        now: NOW,
      }),
    ).toEqual({ allowed: true })
  })

  it('caps an IP at 20 requests per hour across different addresses', async () => {
    withBucketStore()
    let now = NOW
    for (let i = 0; i < 20; i++) {
      const result = await checkEmailLinkRateLimit({
        normalizedEmail: `user${i}@example.com`,
        clientIp: '203.0.113.7',
        now,
      })
      expect(result).toEqual({ allowed: true })
      now += 1_000
    }

    expect(
      await checkEmailLinkRateLimit({
        normalizedEmail: 'user99@example.com',
        clientIp: '203.0.113.7',
        now,
      }),
    ).toEqual({ allowed: false, scope: 'ip' })
  })

  it('does not charge the shared IP bucket when the address bucket already denied', async () => {
    const store = withBucketStore()
    await checkEmailLinkRateLimit({
      normalizedEmail: 'user@example.com',
      clientIp: '203.0.113.7',
      now: NOW,
    })
    const afterFirst = store.size

    await checkEmailLinkRateLimit({
      normalizedEmail: 'user@example.com',
      clientIp: '203.0.113.7',
      now: NOW + 1_000,
    })
    // The denied second request added no hits anywhere.
    expect(store.size).toBe(afterFirst)
    expect([...store.values()].every((b) => b.hits.length === 1)).toBe(true)
  })

  it('FAILS OPEN when the store is unreachable (abuse control, not an auth gate)', async () => {
    mockUncachedFetch.mockRejectedValue(new Error('sanity down'))
    expect(
      await checkEmailLinkRateLimit({
        normalizedEmail: 'user@example.com',
        now: NOW,
      }),
    ).toEqual({ allowed: true })
  })

  it('reads the client IP from the proxy chain, degrading to none', () => {
    expect(
      clientIpFromHeaders(
        new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
      ),
    ).toBe('203.0.113.7')
    expect(clientIpFromHeaders(new Headers({ 'x-real-ip': '198.51.100.4' }))).toBe(
      '198.51.100.4',
    )
    expect(clientIpFromHeaders(new Headers({}))).toBeUndefined()
  })

  it('purges elapsed buckets on the cleanup pass', async () => {
    mockDelete.mockResolvedValueOnce({ results: [{ id: 'a' }] })
    expect(await deleteExpiredEmailSignInRateLimits(NOW)).toEqual({ deleted: 1 })
  })
})
