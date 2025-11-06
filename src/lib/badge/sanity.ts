/**
 * Badge Sanity Operations
 *
 * CRUD operations for speaker badges with Sanity CMS integration
 */

import {
  clientReadUncached as clientRead,
  clientWrite,
} from '@/lib/sanity/client'
import type { BadgeRecord, BadgeType } from './types'

const BADGE_FIELDS = `
  _id,
  _createdAt,
  _updatedAt,
  badge_id,
  speaker->{
    _id,
    name,
    email,
    "image": image.asset->url
  },
  conference->{
    _id,
    title,
    organizer,
    start_date,
    end_date
  },
  badge_type,
  issued_at,
  badge_json,
  baked_svg{
    _type,
    asset->{
      _id,
      url,
      originalFilename
    }
  },
  verification_url,
  email_sent,
  email_sent_at,
  email_id,
  email_error
`

/**
 * Upload baked badge SVG to Sanity assets
 */
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

/**
 * Create a new badge record
 */
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
      badge_id: params.badgeId,
      speaker: {
        _type: 'reference',
        _ref: params.speakerId,
      },
      conference: {
        _type: 'reference',
        _ref: params.conferenceId,
      },
      badge_type: params.badgeType,
      issued_at: params.issuedAt,
      badge_json: params.badgeJson,
      baked_svg: {
        _type: 'file',
        asset: {
          _type: 'reference',
          _ref: params.bakedSvgAssetId,
        },
      },
      verification_url: params.verificationUrl,
      email_sent: false,
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

/**
 * Get badge by ID
 */
export async function getBadgeById(
  badgeId: string,
): Promise<{ badge?: BadgeRecord; error?: Error }> {
  try {
    const badge = await clientRead.fetch<BadgeRecord>(
      `*[_type == "speakerBadge" && badge_id == $badgeId][0]{${BADGE_FIELDS}}`,
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

/**
 * List all badges for a conference
 */
export async function listBadgesForConference(
  conferenceId: string,
): Promise<{ badges?: BadgeRecord[]; error?: Error }> {
  try {
    const badges = await clientRead.fetch<BadgeRecord[]>(
      `*[_type == "speakerBadge" && conference._ref == $conferenceId] | order(issued_at desc) {${BADGE_FIELDS}}`,
      { conferenceId },
    )

    return { badges: badges || [] }
  } catch (error) {
    console.error('Failed to list badges:', error)
    return { error: error as Error }
  }
}

/**
 * List all badges for a speaker
 */
export async function listBadgesForSpeaker(
  speakerId: string,
): Promise<{ badges?: BadgeRecord[]; error?: Error }> {
  try {
    const badges = await clientRead.fetch<BadgeRecord[]>(
      `*[_type == "speakerBadge" && speaker._ref == $speakerId] | order(issued_at desc) {${BADGE_FIELDS}}`,
      { speakerId },
    )

    return { badges: badges || [] }
  } catch (error) {
    console.error('Failed to list speaker badges:', error)
    return { error: error as Error }
  }
}

/**
 * Update badge email sent status
 */
export async function updateBadgeEmailStatus(
  badgeId: string,
  status: 'sent' | 'failed',
  emailId?: string,
  errorMessage?: string,
): Promise<{ badge?: BadgeRecord; error?: Error }> {
  try {
    const badge = await clientRead.fetch<{ _id: string }>(
      `*[_type == "speakerBadge" && badge_id == $badgeId][0]{ _id }`,
      { badgeId },
    )

    if (!badge) {
      return { error: new Error('Badge not found') }
    }

    const updates: Record<string, unknown> = {
      email_sent: status === 'sent',
    }

    if (status === 'sent') {
      updates.email_sent_at = new Date().toISOString()
      if (emailId) {
        updates.email_id = emailId
      }
    }

    if (status === 'failed' && errorMessage) {
      updates.email_error = errorMessage
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

/**
 * Check if a badge already exists for a speaker/conference/type combination
 */
export async function checkBadgeExists(
  speakerId: string,
  conferenceId: string,
  badgeType: BadgeType,
): Promise<{ exists: boolean; badge?: BadgeRecord; error?: Error }> {
  try {
    const badge = await clientRead.fetch<BadgeRecord>(
      `*[_type == "speakerBadge" && speaker._ref == $speakerId && conference._ref == $conferenceId && badge_type == $badgeType][0]{${BADGE_FIELDS}}`,
      { speakerId, conferenceId, badgeType },
    )

    return { exists: !!badge, badge: badge || undefined }
  } catch (error) {
    console.error('Failed to check badge existence:', error)
    return { exists: false, error: error as Error }
  }
}

/**
 * Get badge SVG download URL from Sanity asset
 */
export function getBadgeSVGUrl(badge: BadgeRecord): string | null {
  if (!badge.baked_svg?.asset) {
    return null
  }

  // Type guard to check if asset is expanded
  const asset = badge.baked_svg.asset
  if ('url' in asset && typeof asset.url === 'string') {
    return asset.url
  }

  return null
}

/**
 * Get badge statistics for a conference
 */
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
        badge_type: BadgeType
        email_sent: boolean
        email_error?: string
      }[]
    >(
      `*[_type == "speakerBadge" && conference._ref == $conferenceId]{badge_type, email_sent, email_error}`,
      { conferenceId },
    )

    const stats = {
      totalBadges: badges.length,
      speakerBadges: badges.filter((b) => b.badge_type === 'speaker').length,
      organizerBadges: badges.filter((b) => b.badge_type === 'organizer')
        .length,
      emailsSent: badges.filter((b) => b.email_sent).length,
      emailsFailed: badges.filter((b) => !b.email_sent && b.email_error).length,
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
