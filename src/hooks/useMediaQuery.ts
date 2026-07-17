'use client'

import { useEffect, useState } from 'react'

/**
 * Subscribe to a CSS media query and return whether it currently matches.
 *
 * `defaultValue` is the value used for the server render and the very first
 * client render (before the effect runs), so it must equal what the server
 * would produce to avoid a hydration mismatch. Callers that want the desktop
 * layout to be the SSR default (and therefore never flash on wide screens)
 * pass `true` for a `min-width` query.
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState(defaultValue)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const mediaQuery = window.matchMedia(query)
    const update = () => setMatches(mediaQuery.matches)

    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [query])

  return matches
}
