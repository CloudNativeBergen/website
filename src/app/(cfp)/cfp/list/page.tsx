import { getAuthSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getProposals } from '@/lib/proposal/data/sanity'
import { getGalleryImages } from '@/lib/gallery/sanity'
import { getWorkshopSignupStatisticsBySpeaker } from '@/lib/workshop/sanity'
import { clientReadCached } from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { isConferenceOver } from '@/lib/conference/state'
import { CompactConferenceCard } from '@/components/cfp/CompactConferenceCard'
import { SpeakerShareSidebar } from '@/components/cfp/SpeakerShareSidebar'
import { SpeakerShare } from '@/components/SpeakerShare'
import type { Conference } from '@/lib/conference/types'
import type { ConferenceWithSpeakerData } from '@/lib/dashboard/types'

export default async function SpeakerDashboard() {
  const headersList = await headers()
  const fullUrl = headersList.get('x-url') || ''
  const session = await getAuthSession({ url: fullUrl })

  if (!session?.speaker) {
    return redirect('/api/auth/signin?callbackUrl=/cfp/list')
  }

  const speaker = session.speaker
  const speakerId = speaker._id

  // Fetch all conferences where speaker has activity (server-side)
  const conferencesQuery = groq`
    *[_type == "conference"] | order(start_date desc) {
      _id,
      title,
      organizer,
      city,
      country,
      venue_name,
      venue_address,
      tagline,
      description,
      start_date,
      end_date,
      cfp_start_date,
      cfp_end_date,
      cfp_notify_date,
      cfp_email,
      program_date,
      registration_link,
      registration_enabled,
      workshop_registration_start,
      workshop_registration_end,
      contact_email,
      domains,
      formats,
      features
    }
  `

  const conferences = await clientReadCached.fetch<Conference[]>(
    conferencesQuery,
    {},
    { next: { revalidate: 300 } },
  )

  // Fetch data for each conference in parallel
  const conferenceDataPromises = conferences.map(async (conference) => {
    try {
      const [{ proposals }, galleryImages, workshopStats] = await Promise.all([
        getProposals({
          speakerId,
          conferenceId: conference._id,
          returnAll: false,
        }),
        getGalleryImages(
          {
            speakerId,
            conferenceId: conference._id,
          },
          { useCache: true, revalidate: 300 },
        ),
        getWorkshopSignupStatisticsBySpeaker(speakerId, conference._id).catch(
          () => [],
        ),
      ])

      const isOver = isConferenceOver(conference)
      const canEditProposals = !isOver

      return {
        conference,
        proposals: proposals || [],
        galleryImages,
        workshopStats,
        isOver,
        canEditProposals,
      } as ConferenceWithSpeakerData
    } catch (error) {
      console.error(
        `Error fetching data for conference ${conference._id}:`,
        error,
      )
      return {
        conference,
        proposals: [],
        galleryImages: [],
        workshopStats: [],
        isOver: isConferenceOver(conference),
        canEditProposals: !isConferenceOver(conference),
      } as ConferenceWithSpeakerData
    }
  })

  const conferencesWithData = await Promise.all(conferenceDataPromises)

  // Filter out conferences with no activity
  const activeConferences = conferencesWithData.filter(
    (c) =>
      c.proposals.length > 0 ||
      c.galleryImages.length > 0 ||
      c.workshopStats.length > 0,
  )

  // Calculate totals
  const totalProposals = activeConferences.reduce(
    (sum, c) => sum + c.proposals.length,
    0,
  )

  const upcomingConferences = activeConferences.filter((c) => !c.isOver)

  // Get confirmed talks for speaker share
  const confirmedTalks = activeConferences
    .flatMap((c) =>
      c.proposals.filter(
        (p) => p.status === 'confirmed' || p.status === 'accepted',
      ),
    )
    .slice(0, 1) // Show only the first confirmed talk

  const speakerWithTalks = {
    ...speaker,
    talks: confirmedTalks,
  }

  // Prepare data for speaker share wrapper
  const primaryTalk = confirmedTalks[0]
  const talkTitle = primaryTalk?.title || 'Cloud Native Bergen'
  const eventName = primaryTalk
    ? activeConferences.find((c) =>
        c.proposals.some((p) => p._id === primaryTalk._id),
      )?.conference.title || 'Cloud Native Bergen'
    : 'Cloud Native Bergen'

  if (activeConferences.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Speaker Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Manage your proposals and share your talks
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-base text-gray-600 dark:text-gray-400">
            You haven&apos;t submitted any proposals yet.
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
            Check back after submitting a proposal or when you&apos;re tagged in
            conference photos.
          </p>
        </div>

        <div className="mt-6 max-w-md">
          <SpeakerShare speaker={speakerWithTalks} />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="font-space-grotesk text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Speaker Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Manage your proposals across {activeConferences.length}{' '}
          {activeConferences.length === 1 ? 'conference' : 'conferences'}
        </p>
      </div>

      <div className="flex gap-6">
        {/* Main Content - 2/3 width */}
        <div className="flex-1 space-y-3">
          {activeConferences.map((conferenceData) => (
            <CompactConferenceCard
              key={conferenceData.conference._id}
              data={conferenceData}
              speaker={speaker}
              defaultExpanded={true}
            />
          ))}
        </div>

        {/* Sidebar - Fixed 320px width */}
        <div className="hidden w-80 flex-shrink-0 lg:block">
          <SpeakerShareSidebar
            speaker={speakerWithTalks}
            talkTitle={talkTitle}
            eventName={eventName}
            upcomingConferencesCount={upcomingConferences.length}
            totalProposals={totalProposals}
          />
        </div>
      </div>
    </div>
  )
}
