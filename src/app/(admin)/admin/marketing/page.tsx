import { getAuthSession } from '@/lib/auth'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getProposals } from '@/lib/proposal/server'
import { Status } from '@/lib/proposal/types'
import { SpeakerShare } from '@/components/SpeakerShare'
import { DownloadSpeakerImage } from '@/components/branding/DownloadSpeakerImage'
import { AdminPageHeader } from '@/components/admin'
import {
  DocumentArrowDownIcon,
  UserGroupIcon,
  PresentationChartBarIcon,
} from '@heroicons/react/24/outline'

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="text-lg font-semibold text-red-500 dark:text-red-400">
          {message}
        </div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Please try again or contact support if the issue persists.
        </p>
      </div>
    </div>
  )
}

export default async function MarketingPage() {
  const session = await getAuthSession()

  // Check authentication and organizer permissions
  if (!session?.speaker?.is_organizer) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-gray-500 dark:text-gray-400">
          Access Denied
        </p>
      </div>
    )
  }

  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({ revalidate: 0 })

  if (conferenceError || !conference) {
    console.error('Error loading conference:', conferenceError)
    return <ErrorDisplay message="Error loading conference data" />
  }

  // Get all confirmed proposals
  const { proposals: allProposals, proposalsError } = await getProposals({
    conferenceId: conference._id,
    returnAll: true,
  })

  if (proposalsError) {
    console.error('Error fetching proposals:', proposalsError)
    return <ErrorDisplay message="Error fetching proposals data" />
  }

  // Filter confirmed proposals and extract unique speakers
  const confirmedProposals = allProposals.filter(
    (proposal) => proposal.status === Status.confirmed,
  )

  // Create a map of speakers with their confirmed talks
  const speakerTalksMap = new Map()

  confirmedProposals.forEach((proposal) => {
    const speakers =
      proposal.speakers && Array.isArray(proposal.speakers)
        ? proposal.speakers.filter(
            (speaker) =>
              typeof speaker === 'object' &&
              speaker &&
              'name' in speaker &&
              '_id' in speaker,
          )
        : []

    speakers.forEach((speaker) => {
      const speakerId = speaker._id
      if (!speakerTalksMap.has(speakerId)) {
        speakerTalksMap.set(speakerId, {
          speaker,
          talks: [],
        })
      }
      speakerTalksMap.get(speakerId).talks.push(proposal)
    })
  })

  const speakersWithTalks = Array.from(speakerTalksMap.values())

  return (
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader
        icon={<PresentationChartBarIcon />}
        title="Marketing Materials"
        description={
          <>
            Download speaker sharing cards for{' '}
            <span className="font-medium text-brand-cloud-blue dark:text-blue-300">
              {conference.title}
            </span>
            . High-quality images perfect for social media promotion and
            marketing.
          </>
        }
        stats={[
          {
            value: speakersWithTalks.length,
            label: 'Confirmed speakers',
            color: 'slate',
          },
          {
            value: confirmedProposals.length,
            label: 'Confirmed talks',
            color: 'green',
          },
          {
            value: speakersWithTalks.length,
            label: 'Sharing cards',
            color: 'blue',
          },
          {
            value: speakersWithTalks.filter(({ speaker }) => speaker.image)
              .length,
            label: 'With photos',
            color: 'blue',
          },
          {
            value: speakersWithTalks.filter(({ talks }) => talks.length > 1)
              .length,
            label: 'Multi-talk speakers',
            color: 'purple',
          },
          {
            value: speakersWithTalks.reduce(
              (sum, { talks }) => sum + talks.length,
              0,
            ),
            label: 'Total materials',
            color: 'green',
          },
        ]}
      />

      {speakersWithTalks.length === 0 ? (
        <div className="py-12 text-center">
          <UserGroupIcon className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h3 className="font-space-grotesk mb-2 text-xl font-semibold text-gray-900 dark:text-white">
            No Confirmed Speakers Yet
          </h3>
          <p className="font-inter text-gray-600 dark:text-gray-400">
            Speaker sharing cards will appear here once talks are confirmed.
          </p>
        </div>
      ) : (
        <>
          {/* Instructions */}
          <div className="mb-8 rounded-lg bg-blue-50 p-6 dark:bg-blue-900/20">
            <div className="flex items-start">
              <DocumentArrowDownIcon className="mt-1 mr-3 h-6 w-6 text-brand-cloud-blue dark:text-blue-300" />
              <div>
                <h3 className="font-space-grotesk mb-2 text-lg font-semibold text-brand-cloud-blue dark:text-blue-300">
                  Speaker Sharing Cards
                </h3>
                <p className="font-inter text-sm text-gray-700 dark:text-gray-300">
                  Click &quot;Download as PNG&quot; on any speaker card to save
                  high-quality promotional images. All cards include speaker
                  details and are optimized for social media platforms.
                </p>
              </div>
            </div>
          </div>

          {/* Compact Speaker Cards Grid */}
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
            {speakersWithTalks.map(({ speaker, talks }) => (
              <div key={speaker._id} className="flex flex-col items-center">
                <DownloadSpeakerImage
                  filename={`${speaker.slug || speaker.name?.replace(/\s+/g, '-').toLowerCase()}-speaker-spotlight`}
                >
                  <div
                    className="h-64 w-64"
                    style={{ width: '256px', height: '256px' }}
                  >
                    <SpeakerShare
                      speaker={{
                        ...speaker,
                        talks: talks,
                      }}
                      variant="speaker-spotlight"
                      isFeatured={true}
                      eventName={conference.title || 'Cloud Native Bergen 2025'}
                      className="h-full w-full"
                      showCloudNativePattern={true}
                    />
                  </div>
                </DownloadSpeakerImage>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
