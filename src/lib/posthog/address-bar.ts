import {
  hasRouterMarker,
  type HistoryWrite,
  replaceUrlKeepingState,
  stripUtmFromAddressBar,
  withoutUtm,
} from '@/lib/marketing/strip-utm'

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

/**
 * After the strip, how long and how often it is re-checked. The Next router
 * snapshots `location` at its first render and writes that URL back when it
 * commits; its history patch, which lets it learn a later rewrite, installs
 * only in an effect after that. A strip landing in between is undone by the
 * commit (or by the next refresh), so the strip keeps guarding until the
 * router has taken a rewrite itself.
 */
export const UTM_STRIP_GUARD_MS = 3000
export const UTM_STRIP_GUARD_TICK_MS = 100
/**
 * While the state carries the router's marker but its patch is not installed
 * (a reload of a tagged landing keeps the marker from the previous load),
 * the only way to learn whether the patch has arrived is a write, and a
 * write-back after it: two `replaceState` calls. WebKit throttles history
 * writes to 100 per 30 s, so that probe runs on every Nth tick only.
 */
export const UTM_STRIP_GUARD_PROBE_EVERY = 5

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
  // The landing, as pathname + query. A client-side navigation before the
  // strip moves the visitor to a URL that is not a landing (an app link that
  // happens to carry `utm_*` included), so the strip then leaves it alone.
  const landing = win.location.pathname + win.location.search
  const cleanUrl = new URL(withoutUtm(win.location.href) ?? win.location.href)
  const cleanLanding = cleanUrl.pathname + cleanUrl.search
  const onLanding = () => {
    const here = win.location.pathname + win.location.search
    return here === landing || here === cleanLanding
  }
  let done = false
  let remaining = deadlineMs
  let startedAt = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let unsubscribe: (() => void) | undefined

  const now = () => {
    if (done) return
    done = true
    clearTimeout(timer)
    doc.removeEventListener('visibilitychange', onVisibility)
    unsubscribe?.()
    if (!onLanding()) return
    // Never throw: `now()` runs inside the SDK's `eventCaptured` emit,
    // before the event is queued, so an exception here would lose the
    // landing pageview.
    let write: HistoryWrite | null = null
    try {
      write = stripUtmFromAddressBar(win)
    } catch {
      return
    }
    guard(write === 'router')
  }

  // Re-check on the next macrotask and then every tick until the router has
  // taken a rewrite (it can no longer write the landing URL back) or the
  // guard runs out. Re-strip if the tags came back; once the router has
  // hydrated (its marker is on the state), hand it the clean URL once so its
  // own copy matches. Stops as soon as the visitor leaves the landing.
  function guard(routerSynced: boolean) {
    const until = Date.now() + UTM_STRIP_GUARD_MS
    let synced = routerSynced
    let ticks = 0
    const tick = () => {
      if (!onLanding()) return
      const probe = ticks++ % UTM_STRIP_GUARD_PROBE_EVERY === 0
      try {
        if (withoutUtm(win.location.href) !== null) {
          synced = stripUtmFromAddressBar(win) === 'router'
        } else if (!synced && probe && hasRouterMarker(win.history.state)) {
          synced = replaceUrlKeepingState(win, win.location.href) === 'router'
        }
      } catch {
        return
      }
      if (!synced && Date.now() < until) {
        setTimeout(tick, UTM_STRIP_GUARD_TICK_MS)
      }
    }
    setTimeout(tick, 0)
  }

  // The deadline only counts time the page is visible. The SDK defers its
  // first pageview while the page is hidden (a link opened in a background
  // tab, or a tab switched away before the SDK was ready), and that pageview
  // must still see the tags when it finally fires.
  function run() {
    startedAt = Date.now()
    timer = setTimeout(now, remaining)
  }
  function onVisibility() {
    if (doc.visibilityState === 'visible') {
      if (timer === undefined) run()
    } else if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
      remaining = Math.max(0, remaining - (Date.now() - startedAt))
    }
  }
  doc.addEventListener('visibilitychange', onVisibility)
  if (doc.visibilityState === 'visible') run()

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
