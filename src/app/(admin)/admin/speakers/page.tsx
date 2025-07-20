import { ErrorDisplay, SpeakerTable, SpeakerActions } from '@/components/admin'
import { UserGroupIcon } from '@heroicons/react/24/outline'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting } from '@/lib/proposal/types'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getSpeakers } from '@/lib/speaker/sanity'
import { Status } from '@/lib/proposal/types'

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

    // Get speakers
    const { speakers, err: speakersError } = await getSpeakers(conference._id, [
      Status.accepted,
      Status.confirmed,
    ])

    if (speakersError) {
      return (
        <ErrorDisplay
          title="Error Loading Speakers"
          message={speakersError.message}
        />
      )
    }

    const eligibleSpeakers = speakers.filter(
      (speaker: Speaker & { proposals: ProposalExisting[] }) =>
        speaker.email &&
        speaker.proposals?.some(
          (proposal: ProposalExisting) =>
            proposal.status === 'accepted' || proposal.status === 'confirmed',
        ),
    )

    return (
      <div className="mx-auto max-w-7xl">
        <div className="border-b border-brand-frosted-steel pb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserGroupIcon className="h-8 w-8 text-brand-cloud-blue" />
              <div>
                <h1 className="font-space-grotesk text-2xl leading-7 font-bold text-brand-slate-gray sm:truncate sm:text-3xl sm:tracking-tight">
                  Speaker Management
                </h1>
                <p className="font-inter mt-2 text-sm text-brand-slate-gray/70">
                  Manage speakers with accepted or confirmed talks for{' '}
                  <span className="font-medium text-brand-cloud-blue">
                    {conference.title}
                  </span>
                </p>
              </div>
            </div>

            <SpeakerActions eligibleSpeakersCount={eligibleSpeakers.length} />
          </div>

          <div className="font-inter mt-4 flex items-center gap-4 text-sm text-brand-slate-gray">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-brand-fresh-green"></div>
              <span>
                {
                  speakers.filter((s) =>
                    s.proposals.some((p) => p.status === 'confirmed'),
                  ).length
                }{' '}
                with confirmed talks
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-brand-cloud-blue"></div>
              <span>
                {
                  speakers.filter((s) =>
                    s.proposals.some((p) => p.status === 'accepted'),
                  ).length
                }{' '}
                with accepted talks
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-brand-frosted-steel"></div>
              <span>{speakers.length} total speakers</span>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <SpeakerTable speakers={speakers} />
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
