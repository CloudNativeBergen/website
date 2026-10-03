/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolveConferenceId } from '@/server/trpc'
import { SponsorDashboardClient } from './SponsorDashboardClient'
import { notFound } from 'next/navigation'
import { getSponsorOverview } from '@/lib/sponsor-crm/sanity'

interface SponsorDashboardProps {
  params: { id: string }
}

export default async function SponsorDashboardPage({
  params,
}: SponsorDashboardProps) {
  const sponsorId = params.id
  const conferenceId = await resolveConferenceId()

  if (!sponsorId) {
    notFound()
  }

  // RSC Hydration: Fetch the core overview server-side to prevent the initial skeleton flash
  const { data: initialOverview, error } = await getSponsorOverview(sponsorId)

  if (
    error ||
    !initialOverview ||
    initialOverview.conference?._ref !== conferenceId
  ) {
    notFound()
  }

  return (
    <SponsorDashboardClient
      sponsorId={sponsorId}
      conferenceId={conferenceId}
      initialOverview={initialOverview as any}
    />
  )
}
