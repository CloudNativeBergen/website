import { describe, it, expect, beforeEach } from 'vitest'
import {
  consumeAnnouncementRateLimit,
  resetAnnouncementRateLimits,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  MAX_RATE_ENTRIES,
} from './announcementRateLimit'

beforeEach(() => {
  resetAnnouncementRateLimits()
})

describe('consumeAnnouncementRateLimit', () => {
  it('allows up to RATE_LIMIT_MAX announcements per workshop in-window', () => {
    const t0 = 1_000_000
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      expect(consumeAnnouncementRateLimit('ws-1', t0 + i).allowed).toBe(true)
    }
  })

  it('rejects the (MAX+1)th attempt with a positive retryAfterMs', () => {
    const t0 = 1_000_000
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      consumeAnnouncementRateLimit('ws-1', t0 + i)
    }
    const blocked = consumeAnnouncementRateLimit('ws-1', t0 + RATE_LIMIT_MAX)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBeGreaterThan(0)
  })

  it('isolates the limit per workshop', () => {
    const t0 = 1_000_000
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      consumeAnnouncementRateLimit('ws-1', t0 + i)
    }
    // A different workshop still has a full quota.
    expect(consumeAnnouncementRateLimit('ws-2', t0).allowed).toBe(true)
  })

  it('frees a slot once the oldest attempt ages out of the window', () => {
    const t0 = 1_000_000
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      consumeAnnouncementRateLimit('ws-1', t0 + i)
    }
    expect(consumeAnnouncementRateLimit('ws-1', t0 + 100).allowed).toBe(false)

    // Just past the window relative to the first attempt → one slot reopens.
    const later = t0 + RATE_LIMIT_WINDOW_MS + 1
    expect(consumeAnnouncementRateLimit('ws-1', later).allowed).toBe(true)
  })

  it('caps the module map at MAX_RATE_ENTRIES, evicting the oldest key', () => {
    const t0 = 1_000_000
    // Fill the map to its cap with distinct workshops (each one allowed send).
    for (let i = 0; i < MAX_RATE_ENTRIES; i++) {
      expect(consumeAnnouncementRateLimit(`ws-${i}`, t0).allowed).toBe(true)
    }
    // One more distinct workshop trips the size cap and evicts the oldest key —
    // it must still be allowed and never throw (bounded, best-effort state).
    expect(
      consumeAnnouncementRateLimit(`ws-${MAX_RATE_ENTRIES}`, t0).allowed,
    ).toBe(true)
  })
})
