import { notFound } from 'next/navigation'
import { getBadgeById } from '@/lib/badge/sanity'
import { BadgeDisplay } from '@/components/badge/BadgeDisplay'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
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
  const conferenceName = conference?.title || 'Cloud Native Bergen'
  const badgeTypeName = badge.badge_type === 'speaker' ? 'Speaker' : 'Organizer'

  return {
    title: `${badgeTypeName} Badge - ${speakerName}`,
    description: `Verified ${badgeTypeName} Badge for ${speakerName} at ${conferenceName}. OpenBadges 3.0 compliant digital credential.`,
    openGraph: {
      title: `${badgeTypeName} Badge - ${speakerName}`,
      description: `Verified badge earned at ${conferenceName}`,
      type: 'article',
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <BadgeDisplay
        badge={badge}
        speaker={speaker}
        conference={conference}
        badgeId={badgeId}
        domain={domain}
      />
    </div>
  )
}
