import { after } from 'next/server'

/**
 * Run a never-fail side-effect (e.g. a message fan-out) AFTER the response has
 * been sent, so a slow multi-recipient email/Slack fan-out can't block the
 * mutation's response (batch A / A8).
 *
 * This is also the seam for domain-event publishing (`eventBus.publish`). A
 * bare floating promise is NOT equivalent: on a serverless runtime the instance
 * may be frozen or reclaimed the moment the response flushes, so multi-step
 * subscriber work (provider call -> email -> Sanity write, per speaker) is a
 * race it can lose mid-loop. `after()` keeps the instance alive (it is Vercel's
 * `waitUntil` underneath) without making the caller wait.
 *
 * Prefers Next's `after()`, which defers the task until the App Router request
 * has responded. Outside a request scope — unit tests, or any runtime where
 * `after` has no work store — `after` throws synchronously; we fall back to a
 * detached, self-catching invocation. The passed task is never-fail by
 * contract, but we still guard so a detachment can never surface an unhandled
 * rejection.
 */
export function runAfterResponse(task: () => Promise<void>): void {
  try {
    after(task)
  } catch {
    void task().catch((error) => {
      console.error('Detached after-response task failed:', error)
    })
  }
}
