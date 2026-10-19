'use client'

import { useEffect, useState } from 'react'
import {
  feedbackVisibleAt,
  feedbackWindowStateAt,
  type FeedbackWindow,
} from '@/lib/feedback'

/** setTimeout overflows past ~24.8 days; a longer wait just re-arms. */
const MAX_TIMER_MS = 24 * 60 * 60 * 1000

/**
 * The window moved on by the clock. A speaker may leave the page up to show
 * the QR, so "Opens…" becomes "Open until…" and then "Closed" at the
 * window's own instants, and their feedback shows once the last slot ends, derived here, never refetched: a refetch would
 * blank the QR on the lectern while it loads, and show an error if it
 * failed. Re-derived once as soon as the answer arrives too, since a boundary
 * may have passed while the request was in flight.
 */
export function useWindowOnTheClock(
  computed: FeedbackWindow | undefined,
): FeedbackWindow | undefined {
  const opensAt = computed?.opensAt
  const closesAt = computed?.closesAt
  const lastSlotEnd = computed?.lastSlotEnd
  // A sample belongs to the window it was taken for: a moved session's
  // window is first shown as the server computed it, then sampled afresh.
  const key = `${opensAt}|${closesAt}`
  const [sample, setSample] = useState<{ key: string; at: number } | null>(null)
  const now = sample?.key === key ? sample.at : null
  useEffect(() => {
    if (!opensAt || !closesAt) return
    const current = Date.now()
    const next = [opensAt, lastSlotEnd, closesAt]
      .filter((t) => t !== undefined)
      .map((t) => Date.parse(t))
      .sort((a, b) => a - b)
      .find((t) => t > current)
    const wait =
      now === null ? 0 : next === undefined ? null : next - current + 50
    if (wait === null) return
    const timer = setTimeout(
      () => setSample({ key, at: Date.now() }),
      Math.min(wait, MAX_TIMER_MS),
    )
    return () => clearTimeout(timer)
  }, [opensAt, lastSlotEnd, closesAt, key, now])
  // Timers do not run while a laptop sleeps, so a page left up through the
  // session start would keep its old state: re-read the clock on return.
  useEffect(() => {
    if (!opensAt || !closesAt) return
    const tick = () => {
      if (document.visibilityState === 'visible')
        setSample({ key, at: Date.now() })
    }
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [opensAt, closesAt, key])
  if (!computed || now === null) return computed
  return {
    ...computed,
    state: feedbackWindowStateAt(computed, new Date(now)),
    feedbackVisible: feedbackVisibleAt(computed, new Date(now)),
  }
}
