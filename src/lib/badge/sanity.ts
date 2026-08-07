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
  centerGraphicSvg,
  speaker->{
    _id,
    name,
    email,
    "image": coalesce(image.asset->url, imageURL),
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
  generatorVersion,
  badgeJson,
  badgeJwt,
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
  /** Embedded-proof credential as stringified JSON-LD (legacy docs hold a JWT string) */
  badgeJson: string
  /** RS256 JWT credential (absent on legacy docs, which store the JWT in badgeJson) */
  badgeJwt?: string
  bakedSvgAssetId: string
  verificationUrl: string
  /** Generator format version stamped at issuance (see lib/badge/version.ts) */
  generatorVersion: number
}): Promise<{ badge?: BadgeRecord; error?: Error }> {
  try {
    const doc = {
      _type: 'speakerBadge',
      badgeId: params.badgeId,
      generatorVersion: params.generatorVersion,
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
      ...(params.badgeJwt && { badgeJwt: params.badgeJwt }),
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

/**
 * Re-bake an existing badge IN PLACE: swap the regenerated artifacts onto the
 * same document (same `_id`, same `badgeId`, same `verificationUrl`, same
 * `issuedAt`) and stamp the current `generatorVersion`. The previous baked-SVG
 * asset is deleted after the patch so a rebake does not orphan blobs. Used by
 * the rebake flow; issuance uses {@link createBadge}.
 */
export async function patchBadgeArtifacts(
  badgeId: string,
  params: {
    badgeJson: string
    badgeJwt?: string
    bakedSvgAssetId: string
    generatorVersion: number
  },
): Promise<{ badge?: BadgeRecord; error?: Error }> {
  try {
    const existing = await clientRead.fetch<{
      _id: string
      bakedSvg?: { asset?: { _ref?: string } }
    }>(
      `*[_type == "speakerBadge" && badgeId == $badgeId][0]{ _id, bakedSvg }`,
      { badgeId },
    )

    if (!existing) {
      return { error: new Error('Badge not found') }
    }

    const oldAssetId = existing.bakedSvg?.asset?._ref

    const patch: Record<string, unknown> = {
      badgeJson: params.badgeJson,
      generatorVersion: params.generatorVersion,
      bakedSvg: {
        _type: 'file',
        asset: { _type: 'reference', _ref: params.bakedSvgAssetId },
      },
    }
    if (params.badgeJwt) {
      patch.badgeJwt = params.badgeJwt
    }

    const updated = await clientWrite.patch(existing._id).set(patch).commit()

    // Best-effort cleanup of the superseded SVG asset (never fail the rebake on
    // this — the doc already points at the new asset).
    if (oldAssetId && oldAssetId !== params.bakedSvgAssetId) {
      try {
        await clientWrite.delete(oldAssetId)
      } catch (assetError) {
        console.warn('Failed to delete superseded badge SVG asset:', assetError)
      }
    }

    const badge = await clientRead.fetch<BadgeRecord>(
      `*[_type == "speakerBadge" && _id == $id][0]{${BADGE_FIELDS}}`,
      { id: updated._id },
    )

    if (!badge) {
      return { error: new Error('Failed to fetch rebaked badge') }
    }

    return { badge }
  } catch (error) {
    console.error('Failed to patch badge artifacts:', error)
    return { error: error as Error }
  }
}

/**
 * Why a badge lookup produced no badge.
 *
 *  - `not-found`   — the read SUCCEEDED and no badge carries this id.
 *  - `unavailable` — the read FAILED. Whether the badge exists is UNKNOWN.
 *
 * These were the same `{ error }` (#848), which mattered most at
 * `/api/badge/[badgeId]/verify`: that endpoint is consumed by employers and
 * other platforms we do not control, and a Sanity blip answered them with a
 * definitive 404 — indistinguishable, to them, from a forged credential.
 */
export type BadgeLookupReason = 'not-found' | 'unavailable'

export async function getBadgeById(badgeId: string): Promise<{
  badge?: BadgeRecord
  error?: Error
  reason?: BadgeLookupReason
}> {
  try {
    const badge = await clientRead.fetch<BadgeRecord>(
      `*[_type == "speakerBadge" && badgeId == $badgeId][0]{${BADGE_FIELDS}}`,
      { badgeId },
    )

    if (!badge) {
      return { error: new Error('Badge not found'), reason: 'not-found' }
    }

    return { badge }
  } catch (error) {
    console.error('Failed to fetch badge:', error)
    return { error: error as Error, reason: 'unavailable' }
  }
}

/**
 * The TENANT-SCOPED form of {@link getBadgeById}: one badge by its public
 * `badgeId`, but only if it belongs to `conferenceId`.
 *
 * WHY IT IS A SEPARATE FUNCTION (#863). `getBadgeById` looks a badge up by a
 * PUBLIC identifier with no conference predicate, which is right for the public
 * surface — `/api/badge/[badgeId]/verify` and friends must answer for any
 * issuer's badge. It is wrong for an admin action, and `badge.admin.resendEmail`
 * used it: an organizer of tenant A could pass tenant B's badge id and have us
 * MAIL B's speaker. That one ACTS rather than reads, which is why the fix scopes
 * the lookup itself instead of filtering afterwards.
 *
 * The predicate is UNCONDITIONAL, and `conferenceId` is required. An optional
 * `conferenceId` that degrades to "all tenants" when absent is the fail-open
 * shape `eslint-rules/no-unscoped-groq.js` classifies as `optionalTenantFilter`
 * — visible scoping that is visibly wrong. A caller with no resolved conference
 * has no business reading a badge and must refuse before it gets here.
 *
 * A foreign badge is therefore INDISTINGUISHABLE from a nonexistent one: both
 * return `not-found`. That is deliberate — a caller is not entitled to learn
 * that a badge id it does not own exists.
 */
export async function getBadgeForConference(
  badgeId: string,
  conferenceId: string,
): Promise<{
  badge?: BadgeRecord
  error?: Error
  reason?: BadgeLookupReason
}> {
  if (!badgeId || !conferenceId) {
    return { error: new Error('Badge not found'), reason: 'not-found' }
  }

  try {
    const badge = await clientRead.fetch<BadgeRecord>(
      `*[_type == "speakerBadge" && badgeId == $badgeId && conference._ref == $conferenceId][0]{${BADGE_FIELDS}}`,
      { badgeId, conferenceId },
    )

    if (!badge) {
      return { error: new Error('Badge not found'), reason: 'not-found' }
    }

    return { badge }
  } catch (error) {
    console.error('Failed to fetch badge for conference:', error)
    return { error: error as Error, reason: 'unavailable' }
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

/**
 * Every badge THIS CONFERENCE has issued to one speaker.
 *
 * WHY BOTH PREDICATES (#863). The previous `listBadgesForSpeaker` filtered on
 * `speaker._ref` alone, so `badge.admin.list?speakerId=…` returned an arbitrary
 * person's badges — including the `speaker->{email}` projection and the
 * `emailSent`/`emailError` delivery state — to an organizer of any tenant. A
 * speaker is a GLOBAL person shared across tenants (see `requireSpeakerInCurrentOrg`),
 * so their id is not self-scoping: only the badge's own conference is.
 *
 * The conference predicate is UNCONDITIONAL and `conferenceId` is required — an
 * optional one that degrades to "all tenants" when absent is the fail-open
 * `optionalTenantFilter` shape `eslint-rules/no-unscoped-groq.js` reports. A
 * foreign speaker is therefore indistinguishable from one with no badges: both
 * are the empty list, so this cannot be used to probe who exists.
 */
export async function listBadgesForSpeakerInConference(
  speakerId: string,
  conferenceId: string,
): Promise<{ badges?: BadgeRecord[]; error?: Error }> {
  if (!speakerId || !conferenceId) {
    return { badges: [] }
  }

  try {
    const badges = await clientRead.fetch<BadgeRecord[]>(
      `*[_type == "speakerBadge" && speaker._ref == $speakerId && conference._ref == $conferenceId] | order(issuedAt desc) {${BADGE_FIELDS}}`,
      { speakerId, conferenceId },
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

/**
 * Delete a badge SVG asset document. Used for best-effort cleanup when a
 * rebake uploads a new asset but fails before the badge document references
 * it (an unreferenced asset would otherwise be orphaned in the dataset).
 */
export async function deleteBadgeSVGAsset(assetId: string): Promise<void> {
  await clientWrite.delete(assetId)
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
