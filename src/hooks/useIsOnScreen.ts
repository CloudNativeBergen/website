'use client'

import { useEffect, useState, type RefObject } from 'react'

/**
 * True while `ref`'s element is intersecting the viewport AND the page itself
 * is being looked at.
 *
 * Both halves matter for the thing this exists for — gating a repeating timer.
 * `IntersectionObserver` alone keeps reporting "intersecting" for an element
 * that happens to be scrolled into view in a BACKGROUND tab, because the
 * observer is about geometry, not attention; `document.visibilityState` covers
 * the other axis.
 *
 * Where `IntersectionObserver` does not exist (jsdom, very old browsers) this
 * reports `true` FROM THE FIRST RENDER, i.e. it degrades to the un-gated
 * behaviour rather than silently disabling whatever it gates. Deciding that in
 * the initialiser rather than in an effect matters: an effect that set state
 * would force a second render of every consumer on every mount, which shows up
 * as duplicated work (and duplicated image-URL construction) everywhere the
 * observer is missing.
 */
export function useIsOnScreen(
  ref: RefObject<Element | null>,
  { rootMargin = '0px' }: { rootMargin?: string } = {},
): boolean {
  const [isOnScreen, setIsOnScreen] = useState(
    () => typeof IntersectionObserver === 'undefined',
  )

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') return

    let isIntersecting = false
    const publish = () => {
      setIsOnScreen(
        isIntersecting && (typeof document === 'undefined' || !document.hidden),
      )
    }

    const observer = new IntersectionObserver(
      (entries) => {
        isIntersecting = entries[entries.length - 1].isIntersecting
        publish()
      },
      { rootMargin },
    )
    observer.observe(element)

    document.addEventListener('visibilitychange', publish)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', publish)
    }
  }, [ref, rootMargin])

  return isOnScreen
}
