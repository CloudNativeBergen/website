/**
 * The wall-clock discipline every HTTP publish adapter shares (Bluesky
 * #1005, Buffer #1129): a publish has ONE budget, and no request may start
 * past it or outlive it. Aborting — not racing — is the point: a raced
 * request keeps running after its caller gave up, and for a create call
 * that is a post nobody is waiting to record.
 */

export class PublishDeadlineError extends Error {
  constructor() {
    super('Publish budget exhausted before the request was made')
    this.name = 'PublishDeadlineError'
  }
}

/**
 * A `fetch` that refuses to start past `deadline` (rejecting with
 * {@link PublishDeadlineError}, so a caller can tell "never sent" from
 * "sent and timed out") and aborts every request at the earlier of its
 * per-call timeout and the deadline. Caller-supplied signals still apply.
 */
export function withDeadline(
  fetchImpl: typeof fetch,
  deadline: number,
  callTimeoutMs: number,
): typeof fetch {
  return (input, init) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return Promise.reject(new PublishDeadlineError())
    const signals = [AbortSignal.timeout(Math.min(callTimeoutMs, remaining))]
    if (init?.signal) signals.push(init.signal)
    return fetchImpl(input, { ...init, signal: AbortSignal.any(signals) })
  }
}
