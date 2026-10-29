'use client'

import { useEffect } from 'react'
import { EARLY_SIGNUPS_ANCHOR } from './anchor'

/**
 * The mark on a history entry that has been shown the list: a key in the
 * entry's own `history.state`, beside the ones Next keeps there.
 */
const SHOWN = 'earlySignupsShown'

/**
 * The state for a History API write made AT the list (its narrowing
 * control): the entry it writes needs no bringing into view, now or when the
 * organizer comes back to it. A new object each time: Next adds its own keys
 * to the one it is handed.
 */
export const earlySignupsShownState = () => ({ [SHOWN]: true })

/**
 * BRINGS THE "EARLY SIGN-UPS" LIST INTO VIEW WHEN THE ADDRESS ASKS FOR IT
 * (#1348): the count on a sponsor's record links to
 * `/admin/workshops?earlySponsor=…#early-sign-ups`, and the list is far down
 * a long page.
 *
 * Next does not do this for that link. It applies a navigation's fragment
 * once, at the first commit, which is the route's loading state: the section
 * is not on the page yet, or is hidden on a page Next kept mounted, and the
 * intent is dropped. So the page does it, once the list is mounted.
 *
 * ONCE PER HISTORY ENTRY. The effect runs when the page is shown (a first
 * visit, a hard load, and a page Next kept and shows again, whose effects are
 * run again) and when the address changes to another sponsor. It scrolls only
 * if the address carries the list's fragment AND the entry has not been shown
 * the list before, and then marks the entry.
 *
 *  - An ARRIVAL by the link is a new entry, so it has no mark: the list is
 *    brought into view, also on a kept page and for the same sponsor again.
 *  - A RETURN to an entry (Back, Forward, a reload) finds the mark: the hook
 *    moves nothing, and the position is the browser's and Next's to decide.
 *    Measured in Chromium, the browser then goes to the fragment itself, so a
 *    return still ends at the list; the hook is not what puts it there.
 *  - The list's own control writes its entry with the mark
 *    (`earlySignupsShownState`): the organizer is at the list already.
 *
 * NOTHING MOVES on a view without the fragment.
 */
export function useBringEarlySignupsIntoView(earlySponsorId: string | null) {
  useEffect(() => {
    if (window.location.hash !== `#${EARLY_SIGNUPS_ANCHOR}`) return
    const state: unknown = window.history.state
    const entry =
      state && typeof state === 'object'
        ? (state as Record<string, unknown>)
        : {}
    if (entry[SHOWN]) return
    const section = document.getElementById(EARLY_SIGNUPS_ANCHOR)
    if (!section) return
    // The section's `scroll-mt-*` keeps it clear of the admin's fixed header.
    section.scrollIntoView({ block: 'start', behavior: 'instant' })
    // The entry's other state is kept as it is: Next's own keys are in it,
    // and with them there Next passes this write straight through.
    window.history.replaceState({ ...entry, [SHOWN]: true }, '')
  }, [earlySponsorId])
}
