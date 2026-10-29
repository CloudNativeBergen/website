import { api } from '@/lib/trpc/client'

/**
 * After an announcement is written (posted, edited, deleted): mark every cached
 * read of it stale, so nothing in this browser keeps showing the old copy.
 *
 * TWO reads show a workshop's announcements: the organizer's own list for that
 * workshop, and the attendee portal's one read for the whole conference. They
 * share the query cache, so an organizer who looks at the portal after an edit
 * would otherwise see what was cached before it.
 */
export function useRefreshAnnouncements(): (workshopId: string) => void {
  const utils = api.useUtils()
  return (workshopId) => {
    void utils.workshop.announcements.invalidate({ workshopId })
    void utils.workshop.announcementsByWorkshop.invalidate()
  }
}
