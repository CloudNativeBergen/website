import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { isUnknownHost } from '@/lib/conference/guard'
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

  // `getConferenceForDomain` returns a TRUTHY `{} as Conference` on an unknown
  // host, so a bare `!conference` never fires and every query below would run
  // with `conferenceId: undefined`. Use the canonical guard.
  if (isUnknownHost({ conference })) {
    return (
      <ErrorDisplay
        title="No Conference Found"
        message="No conference configuration found for the current domain."
      />
    )
  }

  // Fetch all data on server to prevent loading states
  const stats = await getBadgeStats(conference._id)

  // Fetch speakers with accepted/confirmed talks. The proposals projection
  // crosses editions (a badge shows a speaker's history), so it MUST carry the
  // org id — without it the nested query was unscoped and listed a shared
  // speaker's proposals from every organization (#616). A conference with no
  // resolvable org degrades to this conference's proposals only.
  const { speakers, err: speakersErr } = await getSpeakers(
    conference._id,
    [Status.confirmed, Status.accepted],
    true,
    conference.organization?._ref ?? null,
  )
  if (speakersErr) {
    console.error('Failed to get speakers:', speakersErr)
  }

  // Also get organizers (who may not have talks) — scoped to the current
  // conference's organization so a multi-tenant dataset never surfaces another
  // org's organizers on this page (falls back to global pre-backfill).
  const { speakers: organizers, err: organizersErr } = await getOrganizers(
    conference.organization?._ref ?? null,
  )
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
    if (a.isOrganizer && !b.isOrganizer) return -1
    if (!a.isOrganizer && b.isOrganizer) return 1

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
        conferenceTitle={conference.title}
        conferenceStartDate={conference.startDate}
        domain={conference.domains?.[0]}
        initialSpeakers={sortedSpeakers}
        initialBadges={badges || []}
      />
    </div>
  )
}
