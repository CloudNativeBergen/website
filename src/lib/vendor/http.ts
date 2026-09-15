/**
 * The three things every vendor HTTP adapter on this platform does the same
 * way (docs/INTEGRATION_ADAPTERS.md). They lived once per adapter until the
 * marketing snapshot rail gave us a third and a fourth copy; the policy is the
 * same in all of them, so it belongs in one place where it can be argued with.
 */

/**
 * A `Retry-After` header as an instant, or `undefined` when it says nothing
 * usable. Both forms in RFC 9110 are accepted: delay-seconds (relative to
 * `now`, which the caller passes so tests are deterministic) and an HTTP date.
 * A negative or unparseable value is no information, not a date in the past.
 */
export function parseRetryAfter(
  header: string | null,
  now: Date,
): Date | undefined {
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return new Date(now.getTime() + seconds * 1000)
  }
  const at = new Date(header)
  return Number.isNaN(at.getTime()) ? undefined : at
}

/** An error as a log line: the name and message, never a stack in a message. */
export function describeError(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error)
}

/** A plain object — the only JSON shape a response parser may index into. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
