import 'server-only'
import { del } from '@vercel/blob'

/**
 * An `AbortSignal` that aborts after `ms`, with a plain `abort()`, and a way to
 * stop the timer. Not `AbortSignal.timeout()`: that rejects with a
 * `TimeoutError`, which `@vercel/blob` (2.8) does not treat as an abort and
 * RETRIES, up to ten times with growing waits — so its "timeout" never bounded
 * anything. Measured in `blob-delete.real-client.test.ts`.
 */
export function abortAfter(ms: number): {
  signal: AbortSignal
  clear: () => void
} {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

/**
 * Delete one blob, giving up (retries included) after `ms`. The signal stops
 * a request in flight, but the library's WAIT between retries does not watch
 * it (measured: an abort at 3 s returned at 5.2 s), so the call is also raced
 * against the signal: the answer never waits past `ms`. A request the library
 * still starts after that fails at once on the aborted signal.
 */
export async function deleteBlobWithin(url: string, ms: number): Promise<void> {
  const deadline = abortAfter(ms)
  const gaveUp = new Promise<never>((_, reject) =>
    deadline.signal.addEventListener('abort', () =>
      reject(new Error(`Blob delete gave up after ${ms} ms`)),
    ),
  )
  const deleting = del(url, { abortSignal: deadline.signal })
  // Whichever loses must not become an unhandled rejection.
  deleting.catch(() => {})
  gaveUp.catch(() => {})
  try {
    await Promise.race([deleting, gaveUp])
  } finally {
    deadline.clear()
  }
}
