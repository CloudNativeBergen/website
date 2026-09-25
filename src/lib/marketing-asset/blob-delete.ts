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

/** Delete one blob, giving up (retries included) after `ms`. */
export async function deleteBlobWithin(url: string, ms: number): Promise<void> {
  const deadline = abortAfter(ms)
  try {
    await del(url, { abortSignal: deadline.signal })
  } finally {
    deadline.clear()
  }
}
