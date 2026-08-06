import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #848. `getBadgeById` returned `{ error }` for BOTH "the read succeeded and
 * no badge has this id" and "the read failed", so `/api/badge/[id]/verify`
 * could only answer 404 — a definitive, cacheable "this credential does not
 * exist" — to an external verifier during a Sanity outage.
 *
 * These tests pin the classification at the source. Without them the route's
 * own tests would be asserting on a `reason` that the real loader might never
 * produce.
 */
const badgeFetch = vi.fn()
vi.mock('../sanity/client', () => ({
  clientRead: { fetch: (...a: unknown[]) => badgeFetch(...a) },
  clientWrite: { fetch: (...a: unknown[]) => badgeFetch(...a) },
  clientReadUncached: { fetch: (...a: unknown[]) => badgeFetch(...a) },
}))

import { getBadgeById } from './sanity'

beforeEach(() => vi.clearAllMocks())

describe('getBadgeById distinguishes absence from failure', () => {
  it('reports not-found when the read succeeded and matched nothing', async () => {
    badgeFetch.mockResolvedValue(null)

    const result = await getBadgeById('no-such-badge')

    expect(result.badge).toBeUndefined()
    expect(result.reason).toBe('not-found')
  })

  it('reports unavailable when the read threw', async () => {
    badgeFetch.mockRejectedValue(new Error('ECONNREFUSED sanity.io'))

    const result = await getBadgeById('real-badge')

    expect(result.badge).toBeUndefined()
    expect(result.reason).toBe('unavailable')
    // The two failures are no longer the same value — which is the whole fix.
    expect(result.reason).not.toBe('not-found')
  })

  it('carries no reason at all when a badge is found', async () => {
    badgeFetch.mockResolvedValue({ badgeId: 'real-badge' })

    const result = await getBadgeById('real-badge')

    expect(result.badge).toEqual({ badgeId: 'real-badge' })
    expect(result.reason).toBeUndefined()
    expect(result.error).toBeUndefined()
  })
})
