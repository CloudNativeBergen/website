'use client'

import { useEffect } from 'react'

/** The mark, in the history entry's own state, that the card was shown. */
const shownKey = (anchor: string) => `anchorShown:${anchor}`

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
 * BROUGHT INTO VIEW ONCE PER HISTORY ENTRY, as the early sign-ups are: the
 * tickets card mounts twice on arrival (its skeleton, then the list that
 * streams in seconds later), and a page Next kept runs its effects again
 * when shown. Neither may pull the organizer back once they have scrolled
 * away; on Back, the position is the browser's.
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
      const state: unknown = window.history.state
      const entry =
        state && typeof state === 'object'
          ? (state as Record<string, unknown>)
          : {}
      const section = document.getElementById(anchor)
      if (section && !entry[shownKey(anchor)]) {
        // The section's `scroll-mt-*` keeps it clear of the fixed header.
        section.scrollIntoView?.({ block: 'start', behavior: 'instant' })
        // Next's own keys in the entry are kept, so it passes this through.
        window.history.replaceState({ ...entry, [shownKey(anchor)]: true }, '')
      }
    }
    const openIfLinked = () => {
      if (linked()) setOpen(true)
    }
    window.addEventListener('hashchange', openIfLinked)
    return () => window.removeEventListener('hashchange', openIfLinked)
  }, [anchor, setOpen])
}

/**
 * The `onClick` of a link on this page to such a card. Already at the anchor
 * (arrived by a link to it, or followed before), following it again changes
 * nothing in the address, so the card, which opens on a change, is told here.
 */
export const reopenAnchor = (anchor: string) => () => {
  if (window.location.hash === `#${anchor}`) {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
}
