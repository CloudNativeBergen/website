import { ErrorDisplay, SpeakerTable, SpeakerActions } from '@/components/admin'
import { UserGroupIcon } from '@heroicons/react/24/outline'
import { Speaker, Flags } from '@/lib/speaker/types'
import { ProposalExisting } from '@/lib/proposal/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getSpeakersWithAcceptedTalks } from '@/lib/speaker/sanity'

/**
 * Helper function to check if a speaker has previous accepted talks
 */
function hasPreviousAcceptedTalks(
  speaker: Speaker & { proposals: ProposalExisting[] },
  currentConferenceId: string,
): boolean {
  if (!speaker.proposals || speaker.proposals.length === 0) {
    return false
  }

  // Look for accepted or confirmed talks from other conferences
  return speaker.proposals.some((proposal) => {
    const isAcceptedOrConfirmed =
      proposal.status === 'accepted' || proposal.status === 'confirmed'

    if (!isAcceptedOrConfirmed) {
      return false
    }

    // Check if this proposal is from a different conference
    if (proposal.conference) {
      const proposalConferenceId =
        typeof proposal.conference === 'object' && '_id' in proposal.conference
          ? proposal.conference._id
          : proposal.conference
      return proposalConferenceId !== currentConferenceId
    }

    return false
  })
}

/**
 * Calculate speaker statistics for display
 */
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
  try {
    // Get conference
    const { conference, error: conferenceError } =
      await getConferenceForCurrentDomain()

    if (conferenceError || !conference) {
      return (
        <ErrorDisplay
          title="Conference Not Found"
          message={conferenceError?.message || 'Could not load conference data'}
        />
      )
    }

    // Get speakers (use getSpeakersWithAcceptedTalks to include both accepted and confirmed)
    // Include proposals from other conferences to enable proper speaker indicators
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

    // Only count confirmed speakers for email operations
    const confirmedSpeakers = speakers.filter(
      (speaker: Speaker & { proposals: ProposalExisting[] }) =>
        speaker.email &&
        speaker.proposals?.some(
          (proposal: ProposalExisting) => proposal.status === 'confirmed',
        ),
    )

    // Calculate speaker statistics
    const stats = calculateSpeakerStats(speakers, conference._id)

    return (
      <div className="mx-auto max-w-7xl">
        <div className="pb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserGroupIcon className="h-8 w-8 text-brand-cloud-blue dark:text-blue-300" />
              <div>
                <h1 className="font-space-grotesk text-2xl leading-7 font-bold text-brand-slate-gray sm:truncate sm:text-3xl sm:tracking-tight dark:text-white">
                  Speaker Management
                </h1>
                <p className="font-inter mt-2 text-sm text-brand-slate-gray/70 dark:text-gray-400">
                  Manage speakers with accepted or confirmed talks for{' '}
                  <span className="font-medium text-brand-cloud-blue dark:text-blue-300">
                    {conference.title}
                  </span>
                  . Emails are sent only to speakers with confirmed talks.
                </p>
              </div>
            </div>

            <SpeakerActions
              eligibleSpeakersCount={confirmedSpeakers.length}
              fromEmail={`Cloud Native Bergen <${conference.contact_email}>`}
              conference={conference}
            />
          </div>

          <div className="font-inter mt-4 grid grid-cols-6 gap-3">
            <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
              <div className="text-xl font-bold text-brand-slate-gray dark:text-white">
                {stats.totalSpeakers}
              </div>
              <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
                Total speakers
              </div>
            </div>

            <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
              <div className="text-xl font-bold text-brand-fresh-green dark:text-green-300">
                {stats.confirmedSpeakers}{' '}
                <span className="text-sm font-normal text-brand-slate-gray/60 dark:text-gray-400">
                  (
                  {stats.totalSpeakers > 0
                    ? Math.round(
                        (stats.confirmedSpeakers / stats.totalSpeakers) * 100,
                      )
                    : 0}
                  %)
                </span>
              </div>
              <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
                Confirmed
              </div>
            </div>

            <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
              <div className="text-xl font-bold text-brand-cloud-blue dark:text-blue-300">
                {stats.acceptedSpeakers}{' '}
                <span className="text-sm font-normal text-brand-slate-gray/60 dark:text-gray-400">
                  (
                  {stats.totalSpeakers > 0
                    ? Math.round(
                        (stats.acceptedSpeakers / stats.totalSpeakers) * 100,
                      )
                    : 0}
                  %)
                </span>
              </div>
              <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
                Accepted
              </div>
            </div>

            <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
              <div className="text-xl font-bold text-brand-cloud-blue dark:text-blue-300">
                {stats.newSpeakers}{' '}
                <span className="text-sm font-normal text-brand-slate-gray/60 dark:text-gray-400">
                  (
                  {stats.totalSpeakers > 0
                    ? Math.round(
                        (stats.newSpeakers / stats.totalSpeakers) * 100,
                      )
                    : 0}
                  %)
                </span>
              </div>
              <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
                New speakers
              </div>
            </div>

            <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
              <div className="text-xl font-bold text-brand-nordic-purple dark:text-indigo-300">
                {stats.underrepresentedSpeakers}{' '}
                <span className="text-sm font-normal text-brand-slate-gray/60 dark:text-gray-400">
                  (
                  {stats.totalSpeakers > 0
                    ? Math.round(
                        (stats.underrepresentedSpeakers / stats.totalSpeakers) *
                          100,
                      )
                    : 0}
                  %)
                </span>
              </div>
              <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
                Underrepresented
              </div>
            </div>

            <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-brand-frosted-steel/20 dark:bg-gray-900 dark:ring-gray-700">
              <div className="text-xl font-bold text-brand-fresh-green dark:text-green-300">
                {stats.localSpeakers}{' '}
                <span className="text-sm font-normal text-brand-slate-gray/60 dark:text-gray-400">
                  (
                  {stats.totalSpeakers > 0
                    ? Math.round(
                        (stats.localSpeakers / stats.totalSpeakers) * 100,
                      )
                    : 0}
                  %)
                </span>
              </div>
              <div className="text-xs text-brand-slate-gray/70 dark:text-gray-400">
                Local speakers
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <SpeakerTable
            speakers={speakers}
            currentConferenceId={conference._id}
          />
        </div>
      </div>
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
