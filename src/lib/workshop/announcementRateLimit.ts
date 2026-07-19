/**
 * In-memory, per-workshop rate limit for the announcement broadcast rail: at
 * most {@link RATE_LIMIT_MAX} announcements per workshop per
 * {@link RATE_LIMIT_WINDOW_MS}. This is the classic module-Map pattern — best
 * effort per serverless instance, which is an acceptable bound for a
 * spam/misfire guard (an owner accidentally hammering "Send"). It is NOT a
 * security control; authorization is enforced separately in the router.
 */

export const RATE_LIMIT_MAX = 3
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

/** workshopId -> ascending timestamps (ms) of accepted announcements in-window. */
const buckets = new Map<string, number[]>()

export interface RateLimitResult {
  allowed: boolean
  /** Milliseconds until the caller may try again (0 when allowed). */
  retryAfterMs: number
}

/**
 * Check the workshop's announcement quota and, when under the limit, RECORD this
 * attempt. Prunes timestamps older than the window on every call so the map
 * never grows unbounded for a given key. Pass `now` in tests for determinism.
 */
export function consumeAnnouncementRateLimit(
  workshopId: string,
  now: number = Date.now(),
): RateLimitResult {
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const recent = (buckets.get(workshopId) ?? []).filter((t) => t > windowStart)

  if (recent.length >= RATE_LIMIT_MAX) {
    // Oldest in-window attempt frees a slot once it ages out of the window.
    const retryAfterMs = recent[0] + RATE_LIMIT_WINDOW_MS - now
    buckets.set(workshopId, recent)
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) }
  }

  recent.push(now)
  buckets.set(workshopId, recent)
  return { allowed: true, retryAfterMs: 0 }
}

/** Clear all rate-limit state. Exposed for tests. */
export function resetAnnouncementRateLimits(): void {
  buckets.clear()
}
