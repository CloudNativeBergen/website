import { getAuthSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getProposals } from '@/lib/proposal/data/sanity'
import { getGalleryImages } from '@/lib/gallery/sanity'
import { getWorkshopSignupStatisticsBySpeaker } from '@/lib/workshop/sanity'
import { getTravelSupport } from '@/lib/travel-support/sanity'
import { clientReadCached } from '@/lib/sanity/client'
import { groq } from 'next-sanity'
import { isConferenceOver } from '@/lib/conference/state'
import { CompactConferenceCard } from '@/components/cfp/CompactConferenceCard'
import { SpeakerShareSidebar } from '@/components/cfp/SpeakerShareSidebar'
import { SpeakerShare, generateQRCode } from '@/components/SpeakerShare'
import { BadgeShare } from '@/components/cfp/BadgeShare'
import { sanityImage } from '@/lib/sanity/client'
import type { Conference } from '@/lib/conference/types'
import type { ConferenceWithSpeakerData } from '@/lib/dashboard/types'
import type { BadgeRecord } from '@/lib/badge/types'

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
      const [
        { proposals },
        galleryImages,
        workshopStats,
        { travelSupport },
        badges,
      ] = await Promise.all([
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
        getTravelSupport(speakerId, conference._id),
        clientReadCached.fetch<BadgeRecord[]>(
          groq`*[_type == "speakerBadge" && speaker._ref == $speakerId && conference._ref == $conferenceId] | order(issued_at desc) {
            _id,
            _createdAt,
            badge_id,
            badge_type,
            issued_at,
            verification_url,
            baked_svg{
              asset->{
                _id,
                url
              }
            }
          }`,
          { speakerId, conferenceId: conference._id },
          { next: { revalidate: 300 } },
        ),
      ])

      const isOver = isConferenceOver(conference)
      const canEditProposals = !isOver

      return {
        conference,
        proposals: proposals || [],
        galleryImages,
        workshopStats,
        travelSupport,
        badges: badges || [],
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
        travelSupport: null,
        badges: [],
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
      c.workshopStats.length > 0 ||
      c.travelSupport !== null ||
      c.badges.length > 0,
  )

  // Get confirmed talks for speaker share
  const confirmedTalks = activeConferences
    .flatMap((c) =>
      c.proposals.filter(
        (p) => p.status === 'confirmed' || p.status === 'accepted',
      ),
    )
    .slice(0, 1) // Show only the first confirmed talk

  // Get all badges sorted by issue date (newest first)
  const allBadges = activeConferences
    .flatMap((c) => c.badges)
    .sort(
      (a, b) =>
        new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime(),
    )

  const latestBadge = allBadges[0]

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

  // Determine what to show in sidebar: confirmed talk or latest badge
  const showBadgeInSidebar = !primaryTalk && latestBadge

  let badgeQrCodeUrl: string | undefined
  let badgeEventName: string | undefined
  let speakerImageUrl: string | undefined

  if (showBadgeInSidebar && latestBadge) {
    // Generate QR code for badge verification URL
    badgeQrCodeUrl = latestBadge.verification_url
      ? await generateQRCode(latestBadge.verification_url, 512)
      : undefined

    // Get the conference name for the badge
    const badgeConference = activeConferences.find((c) =>
      c.badges.some((b) => b._id === latestBadge._id),
    )
    badgeEventName = badgeConference?.conference.title || 'Cloud Native Bergen'

    // Get speaker image URL
    if (speaker.image) {
      speakerImageUrl = sanityImage(speaker.image)
        .width(400)
        .height(400)
        .fit('crop')
        .url()
    }
  }

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

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Main Content */}
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

        {/* Sidebar */}
        <div className="w-full shrink-0 lg:w-80">
          {showBadgeInSidebar && latestBadge && badgeQrCodeUrl ? (
            <BadgeShare
              badge={latestBadge}
              speakerName={speaker.name}
              speakerImage={speakerImageUrl}
              eventName={badgeEventName || 'Cloud Native Bergen'}
              qrCodeUrl={badgeQrCodeUrl}
              className="w-full"
            />
          ) : (
            <SpeakerShareSidebar
              speaker={speakerWithTalks}
              talkTitle={talkTitle}
              eventName={eventName}
            />
          )}
        </div>
      </div>
    </div>
  )
}
