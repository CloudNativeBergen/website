'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'

/**
 * IDLE-GATED POLLING.
 *
 * React Query already stops a poll when the WINDOW loses focus
 * (`refetchIntervalInBackground` defaults to false). What it has no opinion
 * about is a tab that is focused and on screen but that nobody is USING — and
 * that is the expensive case, because such a tab polls forever. Production
 * evidence: one client sat on `/admin/messages/<id>` from 21 Aug 07:04 UTC and
 * was still polling days later, at roughly 4,800 Sanity reads an hour.
 *
 * So: a poll stops after {@link POLL_IDLE_AFTER_MS} without user interaction,
 * and RESUMES on the first interaction — with an immediate refetch, which is
 * the property that makes idle-stopping invisible to an active user. Someone
 * who walks away and comes back sees fresh data, not the data from when they
 * left.
 *
 * ## One tracker, not one per component
 *
 * Idleness is a property of the PERSON, not of a query, so it lives in a single
 * module-level store read through `useSyncExternalStore`: one set of listeners
 * and one timer for the whole page, however many polls subscribe. That also
 * makes it impossible for two polls of the same query key to disagree about
 * whether they are idle — which matters, because the notification bell and the
 * PWA badge only collapse into one fetch while their intervals match exactly.
 *
 * ## It composes with the other two gates rather than replacing them
 *
 * - BACKGROUNDED TAB → react-query's `focusManager`; untouched here (and a
 *   `visibilitychange` back to visible counts as activity, so returning to a
 *   backgrounded tab resumes immediately).
 * - HIDDEN PANE / BUSY COMPOSER → the caller's own `enabled` flag.
 * - IDLE PERSON → this module.
 *
 * `SponsorPortalMessages` keeps its own `document.visibilityState` check; this
 * is additive to it, not a replacement.
 */

/**
 * How long a page may go without any user interaction before its polls stop.
 *
 * Five minutes. The signal is deliberately broad (pointer, key, wheel, touch,
 * scroll, focus, tab-visibility), so five minutes of ZERO events from a focused
 * page means nobody is there — a reader scrolling or even just moving the mouse
 * over a thread resets it continuously. The cost of being wrong is one extra
 * request when they come back; the cost of not doing it is unbounded.
 */
export const POLL_IDLE_AFTER_MS = 5 * 60_000

/**
 * How often idleness is re-evaluated. Going idle may therefore lag the
 * threshold by up to this much (never the other way round — waking is
 * event-driven and immediate), which is the right trade: a late stop costs one
 * poll, an early stop would cost freshness.
 */
const IDLE_CHECK_MS = 30_000

/**
 * What counts as "the user is here". Registered in the CAPTURE phase on
 * `window` so events inside any pane, scroll container or focusable control are
 * seen — `focus` and `scroll` do not bubble.
 */
const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'touchstart',
  'scroll',
  'focus',
] as const

let isIdle = false
let lastActivityAt = 0
let checkTimer: ReturnType<typeof setInterval> | null = null
const subscribers = new Set<() => void>()

function emit() {
  for (const notify of subscribers) notify()
}

function markActive() {
  lastActivityAt = Date.now()
  if (isIdle) {
    isIdle = false
    emit()
  }
}

function onVisibilityChange() {
  // Only the return to visibility is activity; going away plainly is not.
  if (document.visibilityState === 'visible') markActive()
}

function startTracking() {
  lastActivityAt = Date.now()
  for (const event of ACTIVITY_EVENTS) {
    window.addEventListener(event, markActive, { passive: true, capture: true })
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  checkTimer = setInterval(() => {
    if (!isIdle && Date.now() - lastActivityAt >= POLL_IDLE_AFTER_MS) {
      isIdle = true
      emit()
    }
  }, IDLE_CHECK_MS)
}

function stopTracking() {
  if (checkTimer !== null) {
    clearInterval(checkTimer)
    checkTimer = null
  }
  for (const event of ACTIVITY_EVENTS) {
    window.removeEventListener(event, markActive, { capture: true })
  }
  document.removeEventListener('visibilitychange', onVisibilityChange)
  // THE ANTI-DEADLOCK LINE, and it has to be HERE rather than in
  // `startTracking`. The store outlives its subscribers, so an idle state left
  // behind by a torn-down page would be read by the next poll's FIRST render —
  // `useSyncExternalStore` calls `getSnapshot` during render, before `subscribe`
  // runs in an effect. Clearing it on the way in (in `startTracking`) is too
  // late: that render has already decided it is not polling, and the correction
  // arrives as an OFF→ON transition, i.e. a phantom `onResume` refetch on every
  // mount. Clearing it on the way OUT leaves the store honest for whoever
  // subscribes next, and never invents a fetch.
  isIdle = false
}

function subscribe(notify: () => void) {
  subscribers.add(notify)
  if (subscribers.size === 1) startTracking()
  return () => {
    subscribers.delete(notify)
    if (subscribers.size === 0) stopTracking()
  }
}

const getSnapshot = () => isIdle
/** The server renders for nobody in particular; never start out idle. */
const getServerSnapshot = () => false

/** Whether the page has gone {@link POLL_IDLE_AFTER_MS} without interaction. */
export function useIsPageIdle(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export interface IdlePollingOptions {
  /** The cadence to poll at while the poll is running. */
  intervalMs: number
  /**
   * The caller's own reason to poll or not — a hidden pane, a signed-out
   * session. Defaults to `true`. Combined with idleness, not overridden by it.
   */
  enabled?: boolean
  /**
   * Called when the poll transitions from OFF to ON — the user came back, or
   * the pane became visible again. Refetch here, so nobody is ever shown the
   * data from before they walked away. NOT called on mount (the query's own
   * mount fetch covers that).
   */
  onResume?: () => void
}

/**
 * The value to hand react-query as `refetchInterval`: {@link
 * IdlePollingOptions.intervalMs} while the user is present and the caller is
 * enabled, `false` otherwise — which CLEARS the observer's timer rather than
 * making its tick a no-op.
 */
export function useIdlePolling({
  intervalMs,
  enabled = true,
  onResume,
}: IdlePollingOptions): number | false {
  const idle = useIsPageIdle()
  const polling = enabled && !idle

  // Held in a ref so an inline arrow at the call site doesn't re-run the
  // resume effect on every render.
  const onResumeRef = useRef(onResume)
  useEffect(() => {
    onResumeRef.current = onResume
  })

  const wasPollingRef = useRef(polling)
  useEffect(() => {
    if (polling && !wasPollingRef.current) {
      onResumeRef.current?.()
    }
    wasPollingRef.current = polling
  }, [polling])

  return polling ? intervalMs : false
}
