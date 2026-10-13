'use client'

import { useCallback, useEffect, useRef } from 'react'
import { EARLY_SIGNUPS_ANCHOR } from './anchor'

/**
 * BRINGS THE "EARLY SIGN-UPS" LIST INTO VIEW WHEN THE ADDRESS ASKS FOR IT
 * (#1348): the count on a sponsor's record links to
 * `/admin/workshops?earlySponsor=…#early-sign-ups`, and the list is the last
 * section of a long page.
 *
 * Next does not do this for that link. It applies a navigation's fragment
 * once, at the first commit, which is the route's loading state: the section
 * is not on the page yet, or is hidden on a page Next kept mounted, and the
 * intent is dropped. So the page does it, once the list is mounted:
 *
 *  - when it is shown with the list's fragment in the address. That covers a
 *    first visit, a reload, and a page Next kept and shows again (its effects
 *    are run again when it is shown);
 *  - and again when the address changes to another sponsor, still with the
 *    fragment, on a page that stayed on screen.
 *
 * NOTHING MOVES on a view without the fragment, nor when the organizer
 * narrows with the list's own control (`narrowedHere`): that writes the
 * fragment too, and they are at the list already.
 */
export function useBringEarlySignupsIntoView(earlySponsorId: string | null) {
  const writtenByTheControl = useRef(false)
  useEffect(() => {
    if (writtenByTheControl.current) {
      writtenByTheControl.current = false
      return
    }
    if (window.location.hash !== `#${EARLY_SIGNUPS_ANCHOR}`) return
    // The section's `scroll-mt-*` keeps it clear of the admin's fixed header.
    document
      .getElementById(EARLY_SIGNUPS_ANCHOR)
      ?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [earlySponsorId])

  /** Call before the control writes a new narrowing to the address. */
  const narrowedHere = useCallback(() => {
    writtenByTheControl.current = true
  }, [])
  return { narrowedHere }
}
