'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'

/** The mark, in the history entry's own state, that the card was shown. */
const shownKey = (anchor: string) => `anchorShown:${anchor}`

/**
 * The marks kept by the Navigation API's entry key, where the browser has it,
 * in session storage. Next drops the page's own keys from `history.state` on
 * `router.refresh()` (every save on this page refreshes); the entry key
 * survives that, and with session storage a reload too.
 */
const storedKey = (entry: string, anchor: string) =>
  `anchorShown:${entry}:${anchor}`
/** The Navigation API, where the browser has it. */
const navigationApi = () =>
  (
    window as unknown as {
      navigation?: EventTarget & { currentEntry?: { key: string } | null }
    }
  ).navigation
const entryKey = () => navigationApi()?.currentEntry?.key

function shownInThisEntry(anchor: string) {
  const key = entryKey()
  try {
    if (key && sessionStorage.getItem(storedKey(key, anchor))) return true
  } catch {
    // Storage blocked: the mark in the entry's state is all there is.
  }
  const state: unknown = window.history.state
  return (
    !!state &&
    typeof state === 'object' &&
    !!(state as Record<string, unknown>)[shownKey(anchor)]
  )
}

function markShownInThisEntry(anchor: string) {
  const key = entryKey()
  try {
    if (key) sessionStorage.setItem(storedKey(key, anchor), '1')
  } catch {
    // Storage blocked: the mark in the entry's state is all there is.
  }
  const state: unknown = window.history.state
  // Next's own keys in the entry are kept, so it passes this through.
  window.history.replaceState(
    {
      ...(state && typeof state === 'object' ? state : {}),
      [shownKey(anchor)]: true,
    },
    '',
  )
}

/** Sent by a link on this page to a card ({@link goToAnchor}). */
const GO_TO_ANCHOR = 'workshops:go-to-anchor'

/**
 * A COLLAPSED CARD THAT A LINK POINTS AT OPENS, AND IS SHOWN (#1452).
 *
 * ARRIVING with the card's anchor in the address (a link from another page,
 * a notification), the card opens and is brought into view: Next applies a
 * link's fragment once, at the route's loading state, before the card is on
 * the page (see `useBringEarlySignupsIntoView`), and the card sits far down.
 * Brought into view ONCE PER HISTORY ENTRY, as the early sign-ups are: the
 * tickets card mounts twice on arrival (its skeleton, then the list that
 * streams in seconds later), and a page Next kept runs its effects again
 * when shown. Neither may pull the organizer back once they have scrolled
 * away. On Back or a reload the position is the browser's.
 *
 * A LINK ON THIS PAGE ({@link goToAnchor}) opens it and brings it into view
 * every time. A Next link to the anchor followed while on the page (a
 * notification) is an arrival in a new entry, and is treated as one.
 *
 * SCROLLED ONCE THE CARD IS OPEN, not before: the card is near the end of the
 * page, and scrolled while collapsed the page is too short to bring it to the
 * top, so its content would open below the fold.
 *
 * `setOpen` must be stable (a state setter).
 */
export function useOpenedByAnchor(
  anchor: string,
  open: boolean,
  setOpen: (open: boolean) => void,
) {
  // A request to bring the card into view, carried out once it is open.
  const [requested, setRequested] = useState(0)
  const handled = useRef(0)

  useEffect(() => {
    const show = (scroll: boolean) => {
      setOpen(true)
      if (scroll) setRequested((n) => n + 1)
    }
    const arrive = () => {
      if (window.location.hash !== `#${anchor}`) return
      const first = !shownInThisEntry(anchor)
      if (first) markShownInThisEntry(anchor)
      show(first)
    }
    // After mount: the server render has no address hash.
    arrive()
    // ARRIVING WHILE ON THE PAGE: a Next link to this page with the anchor (a
    // notification in the bell) keeps the page mounted and pushes an entry,
    // which fires no `hashchange`. Only a NEW entry counts: a refresh after a
    // save replaces the entry, and must not reopen a card the organizer shut.
    const onEntryChange = (event: Event) => {
      if (
        (event as Event & { navigationType?: string }).navigationType === 'push'
      ) {
        arrive()
      }
    }
    const onGoTo = (event: Event) => {
      if ((event as CustomEvent<string>).detail === anchor) show(true)
    }
    const navigation = navigationApi()
    navigation?.addEventListener('currententrychange', onEntryChange)
    // An address edited by hand.
    window.addEventListener('hashchange', arrive)
    window.addEventListener(GO_TO_ANCHOR, onGoTo)
    return () => {
      navigation?.removeEventListener('currententrychange', onEntryChange)
      window.removeEventListener('hashchange', arrive)
      window.removeEventListener(GO_TO_ANCHOR, onGoTo)
    }
  }, [anchor, setOpen])

  useEffect(() => {
    if (!open || requested === handled.current) return
    handled.current = requested
    // The section's `scroll-mt-*` keeps it clear of the fixed header.
    document
      .getElementById(anchor)
      ?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
  }, [anchor, open, requested])
}

/**
 * THE `onClick` OF A LINK ON THIS PAGE TO ONE OF ITS SECTIONS. The link keeps
 * its `href` (copy, open in a new tab), but a click is handled here and does
 * NOT move the address: a fragment the browser adds makes a history entry
 * Next does not know, and Next ignores Back to it and writes the old address
 * over it on the next `router.refresh()` (every save on this page).
 *
 * The section is brought into view (a collapsed card opens first, through
 * {@link useOpenedByAnchor}), and focus moves to its heading, as following
 * the link would have taken a keyboard user there.
 */
export const goToAnchor =
  (anchor: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    // A modified click (new tab, new window) is the browser's.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    const section = document.getElementById(anchor)
    section?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    window.dispatchEvent(new CustomEvent(GO_TO_ANCHOR, { detail: anchor }))
    section
      ?.querySelector<HTMLElement>('h2, h3')
      ?.focus({ preventScroll: true })
  }
