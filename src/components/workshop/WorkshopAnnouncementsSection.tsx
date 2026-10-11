'use client'

import { api } from '@/lib/trpc/client'
import WorkshopAnnouncements from './WorkshopAnnouncements'

interface WorkshopAnnouncementsSectionProps {
  workshopId: string
}

/**
 * Data wrapper that renders one workshop's broadcast announcements in the
 * presentational {@link WorkshopAnnouncements} block. Kept separate so the block
 * itself stays trivially inspectable in Storybook without a network layer.
 *
 * ONE REQUEST FOR THE WHOLE PAGE. Every section asks for the same thing, all
 * the conference's announcements keyed by workshop, so the query client makes
 * the request once however many cards are on the page, and each section takes
 * its own workshop's share.
 */
export default function WorkshopAnnouncementsSection({
  workshopId,
}: WorkshopAnnouncementsSectionProps) {
  const { data } = api.workshop.announcementsByWorkshop.useQuery()
  return <WorkshopAnnouncements announcements={data?.data[workshopId] ?? []} />
}
