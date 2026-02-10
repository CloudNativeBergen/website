import { ErrorDisplay } from '@/components/admin'
import SpeakersPageClient from '@/components/admin/SpeakersPageClient'
import { Speaker, Flags } from '@/lib/speaker/types'
import { ProposalExisting } from '@/lib/proposal/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getSpeakersWithAcceptedTalks } from '@/lib/speaker/sanity'
import { hasPreviousAcceptedTalks } from '@/lib/speaker/utils'
import { unstable_noStore as noStore } from 'next/cache'

function calculateSpeakerStats(
  speakers: (Speaker & { proposals: ProposalExisting[] })[],
  currentConferenceId: string,
) {
  const totalSpeakers = speakers.length

  const confirmedSpeakers = speakers.filter((speaker) =>
    speaker.proposals?.some((proposal) => proposal.status === 'confirmed'),
  ).length

  const acceptedSpeakers = speakers.filter((speaker) =>
    speaker.proposals?.some((proposal) => proposal.status === 'accepted'),
  ).length

  const newSpeakers = speakers.filter(
    (speaker) => !hasPreviousAcceptedTalks(speaker, currentConferenceId),
  ).length

  const underrepresentedSpeakers = speakers.filter((speaker) =>
    speaker.flags?.includes(Flags.diverseSpeaker),
  ).length

  const localSpeakers = speakers.filter((speaker) =>
    speaker.flags?.includes(Flags.localSpeaker),
  ).length

  return {
    totalSpeakers,
    confirmedSpeakers,
    acceptedSpeakers,
    newSpeakers,
    underrepresentedSpeakers,
    localSpeakers,
  }
}

export default async function AdminSpeakers() {
  noStore()
  try {
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain({})

    if (conferenceError || !conference) {
      return (
        <ErrorDisplay
          title="Conference Not Found"
          message={conferenceError?.message || 'Could not load conference data'}
        />
      )
    }

    const { speakers, err: speakersError } = await getSpeakersWithAcceptedTalks(
      conference._id,
      true,
    )

    if (speakersError) {
      return (
        <ErrorDisplay
          title="Error Loading Speakers"
          message={speakersError.message}
        />
      )
    }

    const confirmedSpeakers = speakers.filter(
      (speaker: Speaker & { proposals: ProposalExisting[] }) =>
        speaker.email &&
        speaker.proposals?.some(
          (proposal: ProposalExisting) => proposal.status === 'confirmed',
        ),
    )

    const stats = calculateSpeakerStats(speakers, conference._id)

    return (
      <SpeakersPageClient
        speakers={speakers}
        currentConferenceId={conference._id}
        conference={conference}
        stats={{
          totalSpeakers: stats.totalSpeakers,
          confirmedSpeakers: stats.confirmedSpeakers,
          localSpeakers: stats.localSpeakers,
          newSpeakers: stats.newSpeakers,
          diverseSpeakers: stats.underrepresentedSpeakers,
          speakersNeedingTravel: speakers.filter((speaker) =>
            speaker.flags?.includes(Flags.requiresTravelFunding),
          ).length,
        }}
        confirmedSpeakersCount={confirmedSpeakers.length}
        conferenceEmail={`${conference.organizer || 'Cloud Native Days'} <${conference.contact_email}>`}
      />
    )
  } catch (error) {
    console.error('Speakers page error:', error)
    return (
      <ErrorDisplay
        title="Error Loading Page"
        message="An unexpected error occurred while loading the speakers page"
      />
    )
  }
}
