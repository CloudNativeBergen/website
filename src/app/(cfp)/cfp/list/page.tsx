import { getAuthSession } from '@/lib/auth'
import { getProposals } from '@/lib/proposal/server'
import { ProposalList } from '@/components/cfp/ProposalList'
import { WorkshopStatistics } from '@/components/cfp/WorkshopStatistics'
import { SpeakerShare } from '@/components/SpeakerShare'
import { SpeakerSharingActions } from '@/components/branding/SpeakerSharingActions'
import { redirect } from 'next/navigation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getWorkshopSignupStatisticsBySpeaker } from '@/lib/workshop/sanity'
import { Status } from '@/lib/proposal/types'
import { LightBulbIcon } from '@heroicons/react/24/outline'
import { getSpeakerSlug } from '@/lib/speaker/utils'

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-red-500 dark:text-red-400">{message}</p>
    </div>
  )
}

export default async function SpeakerDashboard() {
  const session = await getAuthSession()
  if (!session?.speaker) {
    return redirect('/api/auth/signin?callbackUrl=/cfp/list')
  }

  const {
    conference,
    domain,
    error: conferenceError,
  } = await getConferenceForCurrentDomain()

  if (conferenceError || !conference || !domain) {
    console.error('Error loading conference:', conferenceError)
    return <ErrorDisplay message="Error loading conference" />
  }

  const cfpIsOpen =
    new Date() >= new Date(conference.cfp_start_date) &&
    new Date() <= new Date(conference.cfp_end_date)

  const { proposals: initialProposals, proposalsError } = await getProposals({
    speakerId: session.speaker._id,
    returnAll: false,
  })

  if (proposalsError) {
    console.error('Error fetching proposals:', proposalsError)
    return <ErrorDisplay message="Error fetching proposals" />
  }

  const speaker = session.speaker
  const eventName = conference.title || 'Cloud Native Bergen'
  const speakerSlug = getSpeakerSlug(speaker)
  const speakerUrl = `https://${domain}/speaker/${speakerSlug}`

  const confirmedProposals = initialProposals.filter((p) => {
    if (p.status !== Status.confirmed) return false

    const proposalConferenceId =
      typeof p.conference === 'object' &&
        p.conference !== null &&
        '_id' in p.conference
        ? p.conference._id
        : p.conference._ref

    return proposalConferenceId === conference._id
  })

  let workshopStats = []
  try {
    workshopStats = await getWorkshopSignupStatisticsBySpeaker(
      session.speaker._id,
      conference._id
    )
  } catch (error) {
    console.error('Error fetching workshop statistics:', error)
  }

  return (
    <>
      <div className="mx-auto max-w-2xl lg:max-w-6xl lg:px-12">
        <h1 className="font-jetbrains text-4xl font-bold tracking-tighter text-brand-cloud-blue sm:text-6xl dark:text-blue-400">
          Speaker Dashboard
        </h1>
        <div className="font-inter mt-6 space-y-4 text-xl tracking-normal text-gray-700 dark:text-gray-300">
          <p>
            Thank you for your interest in submitting a presentation to our
            conference.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl lg:max-w-6xl lg:px-12">
        <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ProposalList
              initialProposals={initialProposals}
              cfpIsOpen={cfpIsOpen}
              currentConferenceId={conference._id}
            />

            {workshopStats.length > 0 && (
              <div className="mt-12">
                <WorkshopStatistics statistics={workshopStats} />
              </div>
            )}
          </div>

          {confirmedProposals.length > 0 && (
            <div className="lg:col-span-1">
              <div className="sticky top-8">
                <div className="mt-6 mb-4">
                  <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Share Your Talks
                  </h2>
                </div>

                <div className="space-y-6">
                  {confirmedProposals.map((proposal) => (
                    <div
                      key={proposal._id}
                      className="flex flex-col items-center"
                    >
                      <SpeakerSharingActions
                        filename={`${speakerSlug}-speaker-card`}
                        speakerUrl={speakerUrl}
                        talkTitle={proposal.title}
                        eventName={eventName}
                      >
                        <div
                          className="h-80 w-80"
                          style={{ width: '320px', height: '320px' }}
                        >
                          <SpeakerShare
                            speaker={{
                              ...speaker,
                              talks: [proposal],
                            }}
                            variant="speaker-share"
                            isFeatured={true}
                            ctaUrl={speakerUrl}
                            eventName={eventName}
                            className="h-full w-full"
                            showCloudNativePattern={true}
                          />
                        </div>
                      </SpeakerSharingActions>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
                  <p className="flex items-center justify-center space-x-1 text-center text-xs text-gray-600 dark:text-gray-300">
                    <LightBulbIcon className="h-4 w-4 text-brand-cloud-blue dark:text-blue-400" />
                    <strong className="text-brand-cloud-blue dark:text-blue-400">
                      Pro tip:
                    </strong>
                    <span>
                      Use the download button to save high-quality PNG images
                      perfect for social media sharing!
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
