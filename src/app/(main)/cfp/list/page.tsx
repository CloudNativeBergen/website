import { BackgroundImage } from '@/components/BackgroundImage'
import { Container } from '@/components/Container'
import { PlusCircleIcon } from '@heroicons/react/20/solid'
import { auth } from '@/lib/auth'
import { getProposals } from '@/lib/proposal/sanity'
import { ProposalList } from '@/components/ProposalList'
import { SpeakerPromotion } from '@/components/SpeakerPromotion'
import { DownloadSpeakerImage } from '@/components/branding/DownloadSpeakerImage'
import { redirect } from 'next/navigation'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { Status } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import Link from 'next/link'

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-red-500">{message}</p>
    </div>
  )
}

export default async function SpeakerDashboard() {
  const session = await auth()
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
    conferenceId: conference?._id,
    returnAll: false,
  })

  if (proposalsError) {
    console.error('Error fetching proposals:', proposalsError)
    return <ErrorDisplay message="Error fetching proposals" />
  }

  return (
    <div className="relative py-20 sm:pt-36 sm:pb-24">
      <BackgroundImage className="-top-36 -bottom-14" />
      <Container className="relative">
        <div className="mx-auto max-w-2xl lg:max-w-6xl lg:px-12">
          <h1 className="font-space-grotesk text-4xl font-bold tracking-tight text-brand-slate-gray sm:text-6xl">
            Speaker Dashboard
            {cfpIsOpen && (
              <Link href="/cfp/submit">
                <PlusCircleIcon className="ml-6 inline-block h-12 w-12 text-brand-cloud-blue transition-colors hover:text-brand-cloud-blue/80" />
              </Link>
            )}
          </h1>
          <div className="font-inter mt-6 space-y-4 text-xl tracking-normal text-gray-700">
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
                    <div className="mt-6 mb-6">
                      <h2 className="font-space-grotesk text-2xl font-bold tracking-tight text-brand-slate-gray">
                        Share Your Talks
                      </h2>
                      <p className="font-inter mt-2 text-gray-600">
                        Your speaker social cards
                      </p>
                    </div>

                    <div className="space-y-6">
                      {confirmedProposals.map((proposal) => {
                        // Extract speaker data safely
                        const speaker =
                          typeof proposal.speaker === 'object' &&
                          proposal.speaker
                            ? (proposal.speaker as Speaker)
                            : null

                        return speaker ? (
                          <div
                            key={proposal._id}
                            className="flex flex-col items-center space-y-3"
                          >
                            <DownloadSpeakerImage
                              filename={`${speaker.slug || speaker.name?.replace(/\s+/g, '-').toLowerCase()}-speaker-card`}
                            >
                              <SpeakerPromotion
                                speaker={{
                                  ...speaker,
                                  talks: [proposal], // Include the confirmed proposal as a talk
                                }}
                                variant="speaker-share"
                                eventName={
                                  conference?.title || 'Cloud Native Bergen'
                                }
                                ctaText="View Profile"
                                ctaUrl={`https://${domain}/speaker/${speaker.slug}`}
                                className="w-full max-w-xs"
                              />
                            </DownloadSpeakerImage>
                          </div>
                        ) : null
                      })}
                    </div>

                    <div className="mt-6 rounded-lg bg-brand-cloud-blue/5 p-4">
                      <p className="font-inter text-center text-xs text-brand-slate-gray">
                        💡{' '}
                        <strong className="text-brand-cloud-blue">
                          Pro tip:
                        </strong>{' '}
                        Use the download button to save high-quality PNG images
                        perfect for social media sharing!
                      </p>
                    </div>
                  </div>
                ) : null
              })()}
            </div>
          </div>
        </div>
      </Container>
    </div>
  )
}
