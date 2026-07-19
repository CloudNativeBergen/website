'use client'

import { api } from '@/lib/trpc/client'
import WorkshopAnnouncements from './WorkshopAnnouncements'

interface WorkshopAnnouncementsSectionProps {
  workshopId: string
}

/**
 * Data wrapper that fetches a workshop's broadcast announcements and renders the
 * presentational {@link WorkshopAnnouncements} block. Kept separate so the block
 * itself stays trivially inspectable in Storybook without a network layer.
 */
export default function WorkshopAnnouncementsSection({
  workshopId,
}: WorkshopAnnouncementsSectionProps) {
  const { data } = api.workshop.announcements.useQuery({ workshopId })
  return <WorkshopAnnouncements announcements={data?.data ?? []} />
}
