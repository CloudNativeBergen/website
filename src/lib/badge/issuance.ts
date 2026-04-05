import type { BadgeType } from './types'
import { generateBadgeCredential } from './generator'
import { createBadgeConfiguration } from './config'
import { generateBadgeSVG } from './svg'
import { bakeBadge } from '@/lib/openbadges'
import { formatConferenceDateForBadge, getCurrentDateTime } from '@/lib/time'
import { getSpeaker } from '@/lib/speaker/sanity'
import { createBadge, uploadBadgeSVGAsset, checkBadgeExists } from './sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

interface IssueBadgeParams {
  speakerId: string
  badgeType: BadgeType
  centerGraphicSvg?: string
  conferenceId: string
  currentUserEmail?: string
  isDevelopment: boolean
}

interface IssueBadgeSuccess {
  success: true
  badge: Awaited<ReturnType<typeof createBadge>>['badge'] & {}
  speakerName: string
  speakerEmail: string
}

interface IssueBadgeFailure {
  success: false
  error: string
}

export type IssueBadgeResult = IssueBadgeSuccess | IssueBadgeFailure

export async function issueBadgeForSpeaker(
  params: IssueBadgeParams,
): Promise<IssueBadgeResult> {
  const {
    speakerId,
    badgeType,
    centerGraphicSvg,
    conferenceId,
    currentUserEmail,
    isDevelopment,
  } = params

  const { exists } = await checkBadgeExists(speakerId, conferenceId, badgeType)
  if (exists) {
    return { success: false, error: 'Badge already exists' }
  }

  const { speaker, err: speakerError } = await getSpeaker(speakerId)
  if (speakerError || !speaker) {
    return { success: false, error: 'Speaker not found' }
  }

  if (isDevelopment && speaker.email !== currentUserEmail) {
    return {
      success: false,
      error: `Development mode: Can only issue to yourself (${currentUserEmail})`,
    }
  }

  if (badgeType === 'organizer' && !speaker.isOrganizer) {
    return {
      success: false,
      error: `Not eligible: ${speaker.name} is not an organizer`,
    }
  }

  if (badgeType === 'speaker') {
    const { clientReadUncached } = await import('@/lib/sanity/client')
    const hasAcceptedTalk = await clientReadUncached.fetch(
      `count(*[_type == "talk" &&
        references($speakerId) &&
        references($conferenceId) &&
        status in ["accepted", "confirmed"]
      ]) > 0`,
      { speakerId: speaker._id, conferenceId },
    )

    if (!hasAcceptedTalk) {
      return {
        success: false,
        error: `Not eligible: ${speaker.name} has no accepted/confirmed talks`,
      }
    }
  }

  const { conference, domain, error } = await getConferenceForCurrentDomain()
  if (error || !conference) {
    return { success: false, error: 'Conference not found' }
  }

  const conferenceYear = conference.startDate
    ? new Date(conference.startDate).getFullYear().toString()
    : new Date().getFullYear().toString()

  const conferenceDate = conference.startDate
    ? formatConferenceDateForBadge(conference.startDate)
    : 'TBD'

  const config = await createBadgeConfiguration(conference, domain)

  let talkId: string | undefined
  let talkTitle: string | undefined
  if (badgeType === 'speaker') {
    const { clientReadUncached } = await import('@/lib/sanity/client')
    const acceptedTalk = await clientReadUncached.fetch<{
      _id: string
      title: string
    } | null>(
      `*[_type == "talk" &&
        references($speakerId) &&
        references($conferenceId) &&
        status in ["accepted", "confirmed"]
      ][0]{_id, title}`,
      { speakerId: speaker._id, conferenceId },
    )
    if (acceptedTalk) {
      talkId = acceptedTalk._id
      talkTitle = acceptedTalk.title
    }
  }

  const { assertion, badgeId } = await generateBadgeCredential(
    {
      speakerId: speaker._id,
      speakerName: speaker.name,
      speakerEmail: speaker.email,
      speakerSlug: speaker.slug,
      conferenceId: conference._id,
      conferenceTitle: conference.title,
      conferenceYear,
      conferenceDate,
      badgeType,
      centerGraphicSvg,
      talkId,
      talkTitle,
    },
    config,
  )

  const svgContent = generateBadgeSVG({
    conferenceTitle: conference.title,
    conferenceYear,
    conferenceDate,
    badgeType,
    centerGraphicSvg,
  })

  const verificationUrl = `${config.baseUrl}/badge/${badgeId}`
  const bakedSvg = bakeBadge(svgContent, assertion)

  const { assetId, error: uploadError } = await uploadBadgeSVGAsset(
    bakedSvg,
    `badge-${speaker.name.replace(/\s+/g, '-').toLowerCase()}-${badgeId}.svg`,
  )

  if (uploadError || !assetId) {
    return { success: false, error: 'Failed to upload badge SVG' }
  }

  const { badge, error: createError } = await createBadge({
    badgeId,
    speakerId: speaker._id,
    conferenceId: conference._id,
    badgeType,
    issuedAt: getCurrentDateTime(),
    badgeJson: assertion,
    bakedSvgAssetId: assetId,
    verificationUrl,
  })

  if (createError || !badge) {
    return { success: false, error: 'Failed to create badge record' }
  }

  return {
    success: true,
    badge,
    speakerName: speaker.name,
    speakerEmail: speaker.email,
  }
}
