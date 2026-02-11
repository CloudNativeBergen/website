import {
  clientReadUncached as clientRead,
  clientWrite,
} from '@/lib/sanity/client'
import type { BadgeRecord, BadgeType } from './types'

const BADGE_FIELDS = `
  _id,
  _createdAt,
  _updatedAt,
  badgeId,
  speaker->{
    _id,
    name,
    email,
    "image": image.asset->url,
    title,
    "slug": slug.current,
    talks[]->{
      _id,
      title
    }
  },
  conference->{
    _id,
    title,
    organizer,
    city,
    country,
    tagline,
    startDate,
    endDate
  },
  badgeType,
  issuedAt,
  badgeJson,
  bakedSvg{
    _type,
    asset->{
      _id,
      url,
      originalFilename
    }
  },
  verificationUrl,
  emailSent,
  emailSentAt,
  emailId,
  emailError
`

export async function uploadBadgeSVGAsset(
  svgContent: string,
  filename: string,
): Promise<{ assetId?: string; error?: Error }> {
  try {
    const blob = new Blob([svgContent], { type: 'image/svg+xml' })
    const file = new File([blob], filename, { type: 'image/svg+xml' })

    const asset = await clientWrite.assets.upload('file', file, {
      filename,
      contentType: 'image/svg+xml',
    })

    return { assetId: asset._id }
  } catch (error) {
    console.error('Failed to upload badge SVG:', error)
    return { error: error as Error }
  }
}

export async function createBadge(params: {
  badgeId: string
  speakerId: string
  conferenceId: string
  badgeType: BadgeType
  issuedAt: string
  badgeJson: string
  bakedSvgAssetId: string
  verificationUrl: string
}): Promise<{ badge?: BadgeRecord; error?: Error }> {
  try {
    const doc = {
      _type: 'speakerBadge',
      badgeId: params.badgeId,
      speaker: {
        _type: 'reference',
        _ref: params.speakerId,
      },
      conference: {
        _type: 'reference',
        _ref: params.conferenceId,
      },
      badgeType: params.badgeType,
      issuedAt: params.issuedAt,
      badgeJson: params.badgeJson,
      bakedSvg: {
        _type: 'file',
        asset: {
          _type: 'reference',
          _ref: params.bakedSvgAssetId,
        },
      },
      verificationUrl: params.verificationUrl,
      emailSent: false,
    }

    const created = await clientWrite.create(doc)

    const badge = await clientRead.fetch<BadgeRecord>(
      `*[_type == "speakerBadge" && _id == $id][0]{${BADGE_FIELDS}}`,
      { id: created._id },
    )

    if (!badge) {
      return { error: new Error('Failed to fetch created badge') }
    }

    return { badge }
  } catch (error) {
    console.error('Failed to create badge:', error)
    return { error: error as Error }
  }
}

export async function getBadgeById(
  badgeId: string,
): Promise<{ badge?: BadgeRecord; error?: Error }> {
  try {
    const badge = await clientRead.fetch<BadgeRecord>(
      `*[_type == "speakerBadge" && badgeId == $badgeId][0]{${BADGE_FIELDS}}`,
      { badgeId },
    )

    if (!badge) {
      return { error: new Error('Badge not found') }
    }

    return { badge }
  } catch (error) {
    console.error('Failed to fetch badge:', error)
    return { error: error as Error }
  }
}

export async function listBadgesForConference(
  conferenceId: string,
): Promise<{ badges?: BadgeRecord[]; error?: Error }> {
  try {
    const badges = await clientRead.fetch<BadgeRecord[]>(
      `*[_type == "speakerBadge" && conference._ref == $conferenceId] | order(issuedAt desc) {${BADGE_FIELDS}}`,
      { conferenceId },
    )

    return { badges: badges || [] }
  } catch (error) {
    console.error('Failed to list badges:', error)
    return { error: error as Error }
  }
}

export async function listBadgesForSpeaker(
  speakerId: string,
): Promise<{ badges?: BadgeRecord[]; error?: Error }> {
  try {
    const badges = await clientRead.fetch<BadgeRecord[]>(
      `*[_type == "speakerBadge" && speaker._ref == $speakerId] | order(issuedAt desc) {${BADGE_FIELDS}}`,
      { speakerId },
    )

    return { badges: badges || [] }
  } catch (error) {
    console.error('Failed to list speaker badges:', error)
    return { error: error as Error }
  }
}

export async function updateBadgeEmailStatus(
  badgeId: string,
  status: 'sent' | 'failed',
  emailId?: string,
  errorMessage?: string,
): Promise<{ badge?: BadgeRecord; error?: Error }> {
  try {
    const badge = await clientRead.fetch<{ _id: string }>(
      `*[_type == "speakerBadge" && badgeId == $badgeId][0]{ _id }`,
      { badgeId },
    )

    if (!badge) {
      return { error: new Error('Badge not found') }
    }

    const updates: Record<string, unknown> = {
      emailSent: status === 'sent',
    }

    if (status === 'sent') {
      updates.emailSentAt = new Date().toISOString()
      if (emailId) {
        updates.emailId = emailId
      }
    }

    if (status === 'failed' && errorMessage) {
      updates.emailError = errorMessage
    }

    const updated = await clientWrite.patch(badge._id).set(updates).commit()

    const updatedBadge = await clientRead.fetch<BadgeRecord>(
      `*[_type == "speakerBadge" && _id == $id][0]{${BADGE_FIELDS}}`,
      { id: updated._id },
    )

    return { badge: updatedBadge || undefined }
  } catch (error) {
    console.error('Failed to update badge email status:', error)
    return { error: error as Error }
  }
}

export async function checkBadgeExists(
  speakerId: string,
  conferenceId: string,
  badgeType: BadgeType,
): Promise<{ exists: boolean; badge?: BadgeRecord; error?: Error }> {
  try {
    const badge = await clientRead.fetch<BadgeRecord>(
      `*[_type == "speakerBadge" && speaker._ref == $speakerId && conference._ref == $conferenceId && badgeType == $badgeType][0]{${BADGE_FIELDS}}`,
      { speakerId, conferenceId, badgeType },
    )

    return { exists: !!badge, badge: badge || undefined }
  } catch (error) {
    console.error('Failed to check badge existence:', error)
    return { exists: false, error: error as Error }
  }
}

export function getBadgeSVGUrl(badge: BadgeRecord): string | null {
  if (!badge.bakedSvg?.asset) {
    return null
  }

  const asset = badge.bakedSvg.asset
  if ('url' in asset && typeof asset.url === 'string') {
    return asset.url
  }

  return null
}

export async function getBadgeStats(conferenceId: string): Promise<{
  totalBadges: number
  speakerBadges: number
  organizerBadges: number
  emailsSent: number
  emailsFailed: number
}> {
  try {
    const badges = await clientRead.fetch<
      {
        badgeType: BadgeType
        emailSent: boolean
        emailError?: string
      }[]
    >(
      `*[_type == "speakerBadge" && conference._ref == $conferenceId]{badgeType, emailSent, emailError}`,
      { conferenceId },
    )

    const stats = {
      totalBadges: badges.length,
      speakerBadges: badges.filter((b) => b.badgeType === 'speaker').length,
      organizerBadges: badges.filter((b) => b.badgeType === 'organizer').length,
      emailsSent: badges.filter((b) => b.emailSent).length,
      emailsFailed: badges.filter((b) => !b.emailSent && b.emailError).length,
    }

    return stats
  } catch (error) {
    console.error('Failed to fetch badge stats:', error)
    return {
      totalBadges: 0,
      speakerBadges: 0,
      organizerBadges: 0,
      emailsSent: 0,
      emailsFailed: 0,
    }
  }
}

export async function deleteBadge(
  badgeId: string,
): Promise<{ success: boolean; error?: Error }> {
  try {
    const badge = await clientRead.fetch<{
      _id: string
      bakedSvg?: { asset?: { _ref?: string } }
    }>(
      `*[_type == "speakerBadge" && badgeId == $badgeId][0]{ _id, bakedSvg }`,
      { badgeId },
    )

    if (!badge) {
      return { success: false, error: new Error('Badge not found') }
    }

    const assetId = badge.bakedSvg?.asset?._ref
    if (assetId) {
      try {
        await clientWrite.delete(assetId)
      } catch (assetError) {
        console.warn('Failed to delete badge SVG asset:', assetError)
      }
    }

    await clientWrite.delete(badge._id)

    return { success: true }
  } catch (error) {
    console.error('Failed to delete badge:', error)
    return { success: false, error: error as Error }
  }
}
