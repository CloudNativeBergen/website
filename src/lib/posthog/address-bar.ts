import { stripUtmFromAddressBar, withoutUtm } from '@/lib/marketing/strip-utm'

/**
 * WHEN the landing URL's `utm_*` leave the address bar (spec §3, #1146). The
 * readers of the landing URL come first: the CFP stash (written by the caller
 * before this is armed), then PostHog's own first `$pageview`, which is how a
 * cookieless visitor is attributed at all — it reads `utm_*` off the address
 * bar at capture time (#1000 finding 2). Stripping before it would
 * unattribute every visitor who never answers the consent bar.
 *
 * So: strip right after the first `$pageview` is captured, or at once where
 * there is no pageview to wait for (the caller says so with `now()`), or after
 * a deadline when the SDK is blocked, slow or never configured. Exactly one
 * `replaceState`, however many of those fire.
 */

/** How long a landing keeps its tags when no pageview is observed. */
export const UTM_STRIP_DEADLINE_MS = 3000

/** The slice of the PostHog client the schedule listens to. */
export interface PageviewSource {
  on(
    event: 'eventCaptured',
    callback: (event: { event: string }) => void,
  ): () => void
}

export interface UtmStripSchedule {
  /** Strip now; everything still armed is cancelled. Idempotent. */
  now(): void
  /** Strip right after `client` captures its first `$pageview`. */
  afterFirstPageview(client: PageviewSource): void
}

const DONE: UtmStripSchedule = { now() {}, afterFirstPageview() {} }

export function scheduleUtmStrip(
  win: Window,
  deadlineMs: number = UTM_STRIP_DEADLINE_MS,
): UtmStripSchedule {
  if (withoutUtm(win.location.href) === null) return DONE

  const doc = win.document
  let done = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let unsubscribe: (() => void) | undefined

  const now = () => {
    if (done) return
    done = true
    clearTimeout(timer)
    doc.removeEventListener('visibilitychange', onVisible)
    unsubscribe?.()
    stripUtmFromAddressBar(win)
  }

  // The deadline only runs while the page is visible. A link opened in a
  // background tab gets its first pageview when the tab is first shown (the
  // SDK defers it until then), and that pageview must still see the tags.
  function onVisible() {
    if (doc.visibilityState !== 'visible') return
    doc.removeEventListener('visibilitychange', onVisible)
    timer = setTimeout(now, deadlineMs)
  }
  if (doc.visibilityState === 'visible') timer = setTimeout(now, deadlineMs)
  else doc.addEventListener('visibilitychange', onVisible)

  return {
    now,
    afterFirstPageview(client) {
      if (done || unsubscribe) return
      // `eventCaptured` fires after the event's properties (the `utm_*`
      // read off the address bar included) are final, so stripping inside
      // the listener cannot reach the event being sent.
      unsubscribe = client.on('eventCaptured', (event) => {
        if (event?.event === '$pageview') now()
      })
    },
  }
}
