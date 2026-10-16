'use client'

import { createContext, useContext } from 'react'
import type { TicketHolderStats } from '@/lib/workshop/holders'

export type ReadyTicketHolderStats = Extract<
  TicketHolderStats,
  { available: true }
>

/** The join as the page holds it: still coming, unavailable, or read. */
export type TicketHolderView =
  | { state: 'loading' }
  | { state: 'unavailable' }
  | { state: 'ready'; stats: ReadyTicketHolderStats }

/**
 * The view of `workshop.admin.ticketHolders`. A failed request and a ticket
 * read that failed on the server are the same to an organizer: unavailable,
 * never zero.
 */
export function ticketHolderView(query: {
  data?: TicketHolderStats
  isError: boolean
}): TicketHolderView {
  if (query.isError) return { state: 'unavailable' }
  if (!query.data) return { state: 'loading' }
  return query.data.available
    ? { state: 'ready', stats: query.data }
    : { state: 'unavailable' }
}

/**
 * The page's one read of the join, for the parts of the page it cannot hand
 * props to: the "Workshop tickets" section is rendered by the server and
 * passed in whole, and its banner counts the people each not-set type keeps
 * out. Absent outside the page, where the banner says what it said before.
 */
export const TicketHolderContext = createContext<TicketHolderView | undefined>(
  undefined,
)

export const useTicketHolders = () => useContext(TicketHolderContext)
