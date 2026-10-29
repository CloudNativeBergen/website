'use client'

import { createContext, useContext, useEffect } from 'react'

/**
 * What the "Workshop tickets" card needs from the organizer: a decision (a
 * type not set, or a stored answer naming a type the provider no longer
 * lists), or nothing it can do because the list could not be read.
 */
export type TicketsAttention = 'decision' | 'unreadable' | null

/**
 * How the "Workshop tickets" card tells the page it needs the organizer
 * (#1452). The card is rendered by the server and passed in whole, so the
 * page cannot read its list; the card says it instead, and the page names it
 * in "Needs attention". Absent outside the page: nothing to tell.
 */
export const TicketsAttentionContext = createContext<
  ((attention: TicketsAttention) => void) | undefined
>(undefined)

export function useReportTicketsAttention(attention: TicketsAttention) {
  const report = useContext(TicketsAttentionContext)
  useEffect(() => {
    report?.(attention)
    // A card that leaves the page asks for nothing.
    return () => report?.(null)
  }, [report, attention])
}
