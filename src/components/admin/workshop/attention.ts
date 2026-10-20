'use client'

import { createContext, useContext, useEffect } from 'react'

/**
 * How the "Workshop tickets" card tells the page that a ticket type needs a
 * decision (#1452). The card is rendered by the server and passed in whole, so
 * the page cannot read its list; the card says it instead, and the page names
 * it in "Needs attention". Absent outside the page: nothing to tell.
 */
export const TicketsAttentionContext = createContext<
  ((needsDecision: boolean) => void) | undefined
>(undefined)

export function useReportTicketsNeedDecision(needsDecision: boolean) {
  const report = useContext(TicketsAttentionContext)
  useEffect(() => {
    report?.(needsDecision)
    // A card that leaves the page (a refresh that failed) asks for nothing.
    return () => report?.(false)
  }, [report, needsDecision])
}
