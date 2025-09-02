import { getAuthSession } from '@/lib/auth'
import { getProposals } from '@/lib/proposal/server'
import { ProposalList } from '@/components/cfp/ProposalList'
import { SpeakerShare } from '@/components/SpeakerShare'
import { SpeakerSharingActions } from '@/components/branding/SpeakerSharingActions'
import { redirect } from 'next/navigation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { Status } from '@/lib/proposal/types'
import { LightBulbIcon } from '@heroicons/react/24/outline'

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

  if (conferenceError || !conference) {
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

      {/* Two-column layout */}
      <div className="mx-auto max-w-2xl lg:max-w-6xl lg:px-12">
        <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-3">
          {/* Main content - Proposals list (left side, 2/3 width) */}
          <div className="lg:col-span-2">
            <ProposalList
              initialProposals={initialProposals}
              cfpIsOpen={cfpIsOpen}
              currentConferenceId={conference._id}
            />
          </div>

          {/* Social cards sidebar (right side, 1/3 width) */}
          <div className="lg:col-span-1">
            {(() => {
              const confirmedProposals = initialProposals.filter(
                (p) => p.status === Status.confirmed,
              )

              return confirmedProposals.length > 0 ? (
                <div className="sticky top-8">
                  {/* Header aligned with proposals list */}
                  <div className="mt-6 mb-4">
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                      Share Your Talks
                    </h2>
                  </div>

                  <div className="space-y-6">
                    {confirmedProposals.map((proposal) => {
                      // Use the current authenticated user as the speaker
                      const currentSpeaker = session.speaker

                      return currentSpeaker ? (
                        <div
                          key={proposal._id}
                          className="flex flex-col items-center"
                        >
                          <SpeakerSharingActions
                            filename={`${currentSpeaker.slug || currentSpeaker.name?.replace(/\s+/g, '-').toLowerCase()}-speaker-card`}
                            speakerUrl={`https://${domain}/speaker/${currentSpeaker.slug}`}
                            talkTitle={proposal.title}
                            eventName={
                              conference?.title || 'Cloud Native Bergen'
                            }
                          >
                            <div
                              className="h-80 w-80"
                              style={{ width: '320px', height: '320px' }}
                            >
                              <SpeakerShare
                                speaker={{
                                  ...currentSpeaker,
                                  talks: [proposal], // Include the confirmed proposal as a talk
                                }}
                                variant="speaker-share"
                                isFeatured={true}
                                ctaUrl={`https://${domain}/speaker/${currentSpeaker.slug}`}
                                eventName={
                                  conference?.title || 'Cloud Native Bergen'
                                }
                                className="h-full w-full"
                                showCloudNativePattern={true}
                              />
                            </div>
                          </SpeakerSharingActions>
                        </div>
                      ) : null
                    })}
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
              ) : null
            })()}
          </div>
        </div>
      </div>
    </>
  )
}
