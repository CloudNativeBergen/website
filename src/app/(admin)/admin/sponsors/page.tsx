import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getAuthSession } from '@/lib/auth'
import { isEventHeroWindow } from '@/lib/settings/activation'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { SponsorOverview } from '@/components/admin/sponsor/SponsorOverview'
import { SponsorDashboardBroadcastAction } from '@/components/admin/sponsor/SponsorDashboardBroadcastAction'
import { BuildingOffice2Icon } from '@heroicons/react/24/outline'

export default async function AdminSponsors() {
  const [{ conference, error: conferenceError }, session] = await Promise.all([
    getConferenceForCurrentDomain({}),
    getAuthSession(),
  ])

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={conferenceError.message}
      />
    )
  }

  if (!conference) {
    return (
      <ErrorDisplay
        title="No Conference Found"
        message="No conference found for current domain"
      />
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<BuildingOffice2Icon />}
        title="Sponsor Management"
        description="Manage sponsorships, track revenue, and monitor pipeline health for"
        contextHighlight={conference.title}
        actions={<SponsorDashboardBroadcastAction conference={conference} />}
      />

      <SponsorOverview
        organizerId={session?.speaker?._id ?? null}
        revenueGoal={conference.sponsorRevenueGoal}
        showBeforeEvent={isEventHeroWindow(conference)}
      />
    </div>
  )
}
