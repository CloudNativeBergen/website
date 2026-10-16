'use client'

import { api } from '@/lib/trpc/client'

/**
 * Read the ticket holders again, after something changed what they say (an
 * action on a sign-up, a workshop-access save).
 *
 * CANCELLED FIRST. While the page's first read is still on its way the query
 * has no data, and TanStack then hands an invalidation the fetch in flight
 * instead of starting one. That read began before the change, so its answer
 * would be taken as the new one. Nothing is read where the holders are not
 * shown.
 */
export function useRereadTicketHolders() {
  const utils = api.useUtils()
  return () => {
    void utils.workshop.admin.ticketHolders
      .cancel()
      .then(() => utils.workshop.admin.ticketHolders.invalidate())
  }
}
