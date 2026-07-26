import { generateBadgeArtifacts } from './artifacts'
import { createBadgeConfiguration } from './config'
import {
  getBadgeById,
  patchBadgeArtifacts,
  uploadBadgeSVGAsset,
} from './sanity'
import { resolveAcceptedTalk } from './issuance'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { formatConferenceDateForBadge } from '@/lib/time'
import { BADGE_GENERATOR_VERSION } from './version'
import type { BadgeRecord } from './types'

interface RebakeBadgeParams {
  badgeId: string
  /**
   * The request's authoritative (domain-derived) conference id. The badge is
   * rebaked ONLY if it belongs to this conference — the tenant scope. This is
   * the tightest form of the E11 org gate: the admin badge surface is
   * per-conference, so a badge from another conference (and therefore possibly
   * another org) is denied outright.
   */
  conferenceId: string
}

type RebakeFailureReason = 'not_found' | 'forbidden' | 'error'

interface RebakeSuccess {
  success: true
  badge: BadgeRecord
}

interface RebakeFailure {
  success: false
  reason: RebakeFailureReason
  error: string
}

export type RebakeBadgeResult = RebakeSuccess | RebakeFailure

function refId(
  ref: { _id?: string; _ref?: string } | string | undefined,
): string | undefined {
  if (!ref) return undefined
  if (typeof ref === 'string') return ref
  return ref._id ?? ref._ref
}

/**
 * Re-bake a single badge in place with the CURRENT generator. Idempotent: it
 * refuses nothing except a missing badge or a cross-tenant badge. The badgeId,
 * verificationUrl and issuedAt (achievement date) are preserved; badgeJson,
 * badgeJwt, the baked SVG and the proof are re-minted, and generatorVersion is
 * stamped to the current version.
 */
export async function rebakeBadge(
  params: RebakeBadgeParams,
): Promise<RebakeBadgeResult> {
  const { badge, error } = await getBadgeById(params.badgeId)
  if (error || !badge) {
    return { success: false, reason: 'not_found', error: 'Badge not found' }
  }

  // TENANT SCOPE (fail closed): the badge must belong to the request's
  // conference. A badge for a different conference/org is denied.
  const badgeConferenceId = refId(
    badge.conference as { _id?: string; _ref?: string } | string | undefined,
  )
  if (!badgeConferenceId || badgeConferenceId !== params.conferenceId) {
    return {
      success: false,
      reason: 'forbidden',
      error: 'Badge does not belong to this conference',
    }
  }

  const {
    conference,
    domain,
    error: conferenceError,
  } = await getConferenceForCurrentDomain()
  if (conferenceError || !conference) {
    return { success: false, reason: 'error', error: 'Conference not found' }
  }

  // Speaker is dereferenced on the badge record (name/email/slug). Guard the
  // shape defensively — a bare reference cannot seed the credential.
  const speaker = badge.speaker
  if (!speaker || typeof speaker !== 'object' || !('email' in speaker)) {
    return {
      success: false,
      reason: 'error',
      error: 'Badge speaker data unavailable',
    }
  }

  const conferenceYear = conference.startDate
    ? new Date(conference.startDate).getFullYear().toString()
    : new Date().getFullYear().toString()
  const conferenceDate = conference.startDate
    ? formatConferenceDateForBadge(conference.startDate)
    : 'TBD'

  const config = await createBadgeConfiguration(conference, domain)

  const { talkId, talkTitle } =
    badge.badgeType === 'speaker'
      ? await resolveAcceptedTalk(speaker._id, conference._id)
      : {}

  const { credentialJson, credentialJwt, bakedSvg } =
    await generateBadgeArtifacts(
      {
        speakerId: speaker._id,
        speakerName: speaker.name,
        speakerEmail: speaker.email,
        speakerSlug: speaker.slug,
        conferenceId: conference._id,
        conferenceTitle: conference.title,
        conferenceYear,
        conferenceDate,
        badgeType: badge.badgeType,
        talkId,
        talkTitle,
      },
      config,
      // Preserve the identity: same badgeId (⇒ same verificationUrl) and the
      // original achievement date. The proof's `created` is minted now.
      { badgeId: badge.badgeId, validFrom: badge.issuedAt },
    )

  const { assetId, error: uploadError } = await uploadBadgeSVGAsset(
    bakedSvg,
    `badge-${speaker.name.replace(/\s+/g, '-').toLowerCase()}-${badge.badgeId}.svg`,
  )
  if (uploadError || !assetId) {
    return {
      success: false,
      reason: 'error',
      error: 'Failed to upload badge SVG',
    }
  }

  const { badge: updated, error: patchError } = await patchBadgeArtifacts(
    badge.badgeId,
    {
      badgeJson: JSON.stringify(credentialJson),
      badgeJwt: credentialJwt,
      bakedSvgAssetId: assetId,
      generatorVersion: BADGE_GENERATOR_VERSION,
    },
  )
  if (patchError || !updated) {
    return {
      success: false,
      reason: 'error',
      error: 'Failed to update badge record',
    }
  }

  return { success: true, badge: updated }
}
