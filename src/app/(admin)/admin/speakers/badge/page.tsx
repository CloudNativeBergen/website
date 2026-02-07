import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { BadgeManagementClient } from '@/components/admin/BadgeManagementClient'
import { AcademicCapIcon } from '@heroicons/react/24/outline'
import { getBadgeStats, listBadgesForConference } from '@/lib/badge/sanity'
import { getSpeakers, getOrganizers } from '@/lib/speaker/sanity'
import { Status, type ProposalExisting } from '@/lib/proposal/types'
import type { Speaker } from '@/lib/speaker/types'

export default async function AdminBadgePage() {
  const { conference, error } = await getConferenceForCurrentDomain({})

  if (error) {
    return (
      <ErrorDisplay title="Error Loading Conference" message={error.message} />
    )
  }

  if (!conference) {
    return (
      <ErrorDisplay
        title="No Conference Found"
        message="No conference configuration found for the current domain."
      />
    )
  }

  // Fetch all data on server to prevent loading states
  const stats = await getBadgeStats(conference._id)

  // Fetch speakers with accepted/confirmed talks
  const { speakers, err: speakersErr } = await getSpeakers(
    conference._id,
    [Status.confirmed, Status.accepted],
    true,
  )
  if (speakersErr) {
    console.error('Failed to get speakers:', speakersErr)
  }

  // Also get organizers (who may not have talks)
  const { speakers: organizers, err: organizersErr } = await getOrganizers()
  if (organizersErr) {
    console.warn('Could not get organizers:', organizersErr)
  }

  // Merge speakers and organizers, removing duplicates
  const allSpeakersMap = new Map<
    string,
    Speaker & { proposals?: ProposalExisting[] }
  >()
  speakers.forEach((s) => allSpeakersMap.set(s._id, s))
  organizers?.forEach((o) => {
    if (!allSpeakersMap.has(o._id)) {
      allSpeakersMap.set(o._id, { ...o, proposals: [] })
    }
  })
  const allSpeakers = Array.from(allSpeakersMap.values())

  // Sort speakers: organizers first, then speakers from current conference, then others
  const sortedSpeakers = allSpeakers.sort((a, b) => {
    // Prioritize organizers
    if (a.is_organizer && !b.is_organizer) return -1
    if (!a.is_organizer && b.is_organizer) return 1

    // Then prioritize speakers with talks in the current conference
    const aHasCurrentConference =
      a.proposals?.some(
        (p) =>
          typeof p === 'object' &&
          p &&
          'conference' in p &&
          typeof p.conference === 'object' &&
          p.conference &&
          '_id' in p.conference &&
          p.conference._id === conference._id,
      ) ?? false
    const bHasCurrentConference =
      b.proposals?.some(
        (p) =>
          typeof p === 'object' &&
          p &&
          'conference' in p &&
          typeof p.conference === 'object' &&
          p.conference &&
          '_id' in p.conference &&
          p.conference._id === conference._id,
      ) ?? false

    if (aHasCurrentConference && !bHasCurrentConference) return -1
    if (!aHasCurrentConference && bHasCurrentConference) return 1

    // Finally sort alphabetically by name
    return a.name.localeCompare(b.name)
  })

  // Fetch existing badges
  const { badges, error: badgesError } = await listBadgesForConference(
    conference._id,
  )
  if (badgesError) {
    console.error('Failed to get badges:', badgesError)
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Speaker Badges"
        description={
          <>
            Manage OpenBadges v3.0 digital credentials for{' '}
            <span className="font-semibold">{conference.title}</span>
          </>
        }
        icon={<AcademicCapIcon className="h-6 w-6" />}
        backLink={{
          href: '/admin/speakers',
          label: 'Back to Speakers',
        }}
        stats={[
          {
            value: stats.totalBadges,
            label: 'Total badges issued',
            color: 'slate' as const,
          },
          {
            value: stats.speakerBadges,
            label: 'Speaker badges',
            color: 'blue' as const,
          },
          {
            value: stats.organizerBadges,
            label: 'Organizer badges',
            color: 'purple' as const,
          },
          {
            value: stats.emailsSent,
            label: 'Emails sent',
            color: 'green' as const,
          },
          {
            value: stats.emailsFailed,
            label: 'Email failures',
            color: stats.emailsFailed > 0 ? 'purple' : ('slate' as const),
          },
        ]}
      />

      <BadgeManagementClient
        conferenceId={conference._id}
        conferenceTitle={conference.title}
        conferenceStartDate={conference.start_date}
        domain={conference.domains?.[0]}
        initialSpeakers={sortedSpeakers}
        initialBadges={badges || []}
      />
    </div>
  )
}
