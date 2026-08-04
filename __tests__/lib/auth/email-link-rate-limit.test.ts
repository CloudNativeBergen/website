import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

const { mockUncachedFetch, mockCreate, mockPatch, mockDelete } = vi.hoisted(
  () => ({
    mockUncachedFetch: vi.fn(),
    mockCreate: vi.fn(),
    mockPatch: vi.fn(),
    mockDelete: vi.fn(),
  }),
)

vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: { fetch: mockUncachedFetch },
  clientReadCached: { fetch: vi.fn() },
  clientWrite: { create: mockCreate, patch: mockPatch, delete: mockDelete },
}))

import {
  checkEmailLinkRateLimit,
  clientIpFromHeaders,
  deleteExpiredEmailSignInRateLimits,
} from '@/lib/auth/email-link/rateLimit'

const NOW = 1_700_000_000_000
const MIN = 60_000

interface Bucket {
  _rev: string
  hits: number[]
}

/**
 * An in-memory stand-in for the Sanity bucket documents that models the parts
 * of the real contract this limiter depends on:
 *
 *  - `create` on an explicit `_id` FAILS if the document already exists,
 *  - `patch(...).ifRevisionId(rev)` FAILS unless `rev` is still current,
 *  - every operation is asynchronous, so a caller can interleave.
 *
 * `latencyMs` inserts a real await between the read and the write, which is
 * what makes the concurrency test below an actual race rather than a
 * simulation of one.
 */
function withBucketStore({ latencyMs = 0 }: { latencyMs?: number } = {}) {
  const store = new Map<string, Bucket>()
  let revs = 0
  const wait = () =>
    latencyMs > 0
      ? new Promise((resolve) => setTimeout(resolve, latencyMs))
      : Promise.resolve()

  mockUncachedFetch.mockImplementation(
    async (_query: string, params: { id: string }) => {
      await wait()
      const doc = store.get(params.id)
      return doc ? { _id: params.id, _rev: doc._rev, hits: doc.hits } : null
    },
  )

  mockCreate.mockImplementation(
    async (doc: { _id: string; hits: number[] }) => {
      await wait()
      if (store.has(doc._id)) {
        throw Object.assign(new Error('Document already exists'), {
          statusCode: 409,
        })
      }
      store.set(doc._id, { _rev: `rev-${++revs}`, hits: doc.hits })
      return doc
    },
  )

  mockPatch.mockImplementation((id: string) => {
    let expectedRev: string | null = null
    let payload: { hits: number[] } | null = null
    const builder = {
      ifRevisionId(rev: string) {
        expectedRev = rev
        return builder
      },
      set(next: { hits: number[] }) {
        payload = next
        return builder
      },
      async commit() {
        await wait()
        const doc = store.get(id)
        if (!doc || (expectedRev !== null && doc._rev !== expectedRev)) {
          throw Object.assign(new Error('Revision mismatch'), {
            statusCode: 409,
          })
        }
        store.set(id, { _rev: `rev-${++revs}`, hits: payload!.hits })
        return { _id: id }
      },
    }
    return builder
  })

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

    expect(
      await checkEmailLinkRateLimit({ normalizedEmail: email, now: NOW }),
    ).toEqual({ allowed: true })

    // Immediately again: refused by the cooldown rule.
    expect(
      await checkEmailLinkRateLimit({
        normalizedEmail: email,
        now: NOW + 1_000,
      }),
    ).toEqual({ allowed: false, scope: 'email' })

    // After the cooldown: allowed again.
    expect(
      await checkEmailLinkRateLimit({
        normalizedEmail: email,
        now: NOW + 61_000,
      }),
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
    await checkEmailLinkRateLimit({
      normalizedEmail: 'a@example.com',
      now: NOW,
    })
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

  it('FAILS CLOSED when the write never lands (an unpersisted bucket is not a limit)', async () => {
    withBucketStore()
    mockCreate.mockRejectedValue(new Error('write outage'))
    expect(
      await checkEmailLinkRateLimit({
        normalizedEmail: 'user@example.com',
        now: NOW,
      }),
    ).toEqual({ allowed: false, scope: 'email' })
  })

  it('reads the client IP from the proxy chain, degrading to none', () => {
    expect(
      clientIpFromHeaders(
        new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
      ),
    ).toBe('203.0.113.7')
    expect(
      clientIpFromHeaders(new Headers({ 'x-real-ip': '198.51.100.4' })),
    ).toBe('198.51.100.4')
    expect(clientIpFromHeaders(new Headers({}))).toBeUndefined()
  })

  it('purges elapsed buckets on the cleanup pass', async () => {
    mockDelete.mockResolvedValueOnce({ results: [{ id: 'a' }] })
    expect(await deleteExpiredEmailSignInRateLimits(NOW)).toEqual({
      deleted: 1,
    })
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CONCURRENCY — the exploit an adversarial review executed against the original
 * `createOrReplace` implementation, kept as a regression test.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * With a whole-array replace, 50 concurrent requests each read `hits: []` and
 * each wrote `hits: [now]`: all 50 were allowed against a cap of 1, and the
 * bucket afterwards recorded ONE hit — so the history was destroyed and the
 * caps never accumulated across windows either (60 sends in five minutes
 * against a documented 24h cap of 10). Both halves are asserted below.
 */
describe('email sign-in rate limiting under concurrency', () => {
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

  it('holds the cap against a 50-request burst, and keeps the history', async () => {
    const store = withBucketStore({ latencyMs: 1 })
    const email = 'victim@example.com'

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        checkEmailLinkRateLimit({ normalizedEmail: email, now: NOW }),
      ),
    )

    const allowed = results.filter((r) => r.allowed).length
    // The 60-second rule caps this at 1. Previously: 50.
    expect(allowed).toBe(1)

    // And the bucket REMEMBERS it — the failure that made the caps unable to
    // accumulate was the burst leaving a single-hit bucket behind.
    const bucket = [...store.values()][0]
    expect(bucket.hits).toHaveLength(1)
    expect(bucket.hits[0]).toBe(NOW)
  })

  it('cannot be ground past the 24h cap by repeating the burst', async () => {
    withBucketStore({ latencyMs: 1 })
    const email = 'victim@example.com'

    let allowed = 0
    // Five minutes of bursts, each past the 60-second cooldown. The old
    // implementation allowed 20 per round, 60 in total.
    for (let round = 0; round < 5; round++) {
      const now = NOW + round * 61_000
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          checkEmailLinkRateLimit({ normalizedEmail: email, now }),
        ),
      )
      allowed += results.filter((r) => r.allowed).length
    }

    // The 15-minute rule (max 3) governs this span, so at most 3 get through.
    expect(allowed).toBe(3)
  })
})
