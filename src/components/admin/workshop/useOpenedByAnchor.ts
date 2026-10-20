'use client'

import { useEffect } from 'react'

/**
 * A COLLAPSED CARD THAT A LINK POINTS AT OPENS, AND IS SHOWN (#1452).
 *
 * Arriving with the card's anchor in the address (a link from another page,
 * a notification), the card opens and is brought into view: Next applies a
 * link's fragment once, at the route's loading state, before the card is on
 * the page (see `useBringEarlySignupsIntoView`), and the card sits far down.
 * After mount, a link on this page that moves the address to the anchor opens
 * it too; the browser does the scrolling then.
 *
 * `setOpen` must be stable (a state setter).
 */
export function useOpenedByAnchor(
  anchor: string,
  setOpen: (open: boolean) => void,
) {
  useEffect(() => {
    const linked = () => window.location.hash === `#${anchor}`
    if (linked()) {
      setOpen(true)
      // The section's `scroll-mt-*` keeps it clear of the fixed header.
      document
        .getElementById(anchor)
        ?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    }
    const openIfLinked = () => {
      if (linked()) setOpen(true)
    }
    window.addEventListener('hashchange', openIfLinked)
    return () => window.removeEventListener('hashchange', openIfLinked)
  }, [anchor, setOpen])
}
