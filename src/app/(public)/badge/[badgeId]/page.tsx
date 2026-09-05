import { notFound } from 'next/navigation'
import { getBadgeById } from '@/lib/badge/sanity'
import { BadgeDisplay } from '@/components/badge/BadgeDisplay'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { PLATFORM_NAME } from '@/lib/branding/platform'
import type { Metadata } from 'next'
import type { Speaker } from '@/lib/speaker/types'
import type { Conference } from '@/lib/conference/types'

interface BadgePageProps {
  params: Promise<{
    badgeId: string
  }>
}

export async function generateMetadata({
  params,
}: BadgePageProps): Promise<Metadata> {
  const { badgeId } = await params
  const { badge, error } = await getBadgeById(badgeId)

  if (error || !badge) {
    return {
      title: 'Badge Not Found',
      robots: { index: false, follow: false },
    }
  }

  // Verify badge belongs to current domain's conference
  const { conference: currentConference } = await getConferenceForCurrentDomain(
    {},
  )
  const badgeConferenceId =
    typeof badge.conference === 'object' && '_id' in badge.conference
      ? badge.conference._id
      : null

  if (!currentConference._id || badgeConferenceId !== currentConference._id) {
    return {
      title: 'Badge Not Found',
      robots: { index: false, follow: false },
    }
  }

  const speaker =
    typeof badge.speaker === 'object' && 'name' in badge.speaker
      ? badge.speaker
      : null
  const conference =
    typeof badge.conference === 'object' && 'title' in badge.conference
      ? badge.conference
      : null

  const speakerName = speaker?.name || 'Speaker'
  const conferenceName = conference?.title || PLATFORM_NAME
  const badgeTypeName = badge.badgeType === 'speaker' ? 'Speaker' : 'Organizer'
  const title = `${badgeTypeName} Badge - ${speakerName}`
  const description = `Verified ${badgeTypeName} Badge for ${speakerName} at ${conferenceName}. OpenBadges 3.0 compliant digital credential.`

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description: `Verified badge earned at ${conferenceName}`,
      type: 'website',
      siteName: conferenceName,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: `Verified badge earned at ${conferenceName}`,
    },
  }
}

export default async function BadgePage({ params }: BadgePageProps) {
  const { badgeId } = await params
  const { badge, error } = await getBadgeById(badgeId)

  if (error || !badge) {
    notFound()
  }

  // Verify badge belongs to current domain's conference
  const { conference: currentConference, domain } =
    await getConferenceForCurrentDomain({})
  const badgeConferenceId =
    typeof badge.conference === 'object' && '_id' in badge.conference
      ? badge.conference._id
      : null

  if (!currentConference._id || badgeConferenceId !== currentConference._id) {
    notFound()
  }

  const speaker =
    typeof badge.speaker === 'object' && 'name' in badge.speaker
      ? (badge.speaker as Speaker)
      : null
  const conference =
    typeof badge.conference === 'object' && 'title' in badge.conference
      ? (badge.conference as Conference)
      : null

  if (!speaker || !conference) {
    notFound()
  }

  // PUBLIC page, client component: every prop serializes into the flight
  // payload readable by anyone. The badge read projects `speaker->{email}` for
  // server-side flows, but the display never renders it — strip it (and hand
  // BadgeDisplay a bare speaker ref instead of the nested doc) so no email
  // reaches anonymous visitors.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude it
  const { email: _email, ...publicSpeaker } = speaker
  const publicBadge = {
    ...badge,
    speaker: { _type: 'reference' as const, _ref: speaker._id },
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <BadgeDisplay
        badge={publicBadge}
        speaker={publicSpeaker}
        conference={conference}
        badgeId={badgeId}
        domain={domain}
      />
    </div>
  )
}
