import {
  deriveBadgeConferenceFields,
  generateBadgeArtifacts,
} from './artifacts'
import { createBadgeConfiguration } from './config'
import {
  deleteBadgeSVGAsset,
  getBadgeById,
  patchBadgeArtifacts,
  uploadBadgeSVGAsset,
} from './sanity'
import { resolveAcceptedTalk } from './issuance'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
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
/** The signed credential's own validFrom, when the stored JSON parses. */
function storedValidFrom(badgeJson?: string): string | undefined {
  if (!badgeJson) return undefined
  try {
    const parsed = JSON.parse(badgeJson) as { validFrom?: unknown }
    return typeof parsed.validFrom === 'string' ? parsed.validFrom : undefined
  } catch {
    return undefined
  }
}

export async function rebakeBadge(
  params: RebakeBadgeParams,
): Promise<RebakeBadgeResult> {
  const { badge, error } = await getBadgeById(params.badgeId)
  if (error) {
    // A failed READ is not "not found" — surface it as an error so a
    // transient Sanity failure never reads as a missing badge.
    return { success: false, reason: 'error', error: 'Failed to load badge' }
  }
  if (!badge) {
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
  // shape defensively — everything generation touches must be present; a bare
  // reference or partial dereference cannot seed the credential or filename.
  const rawSpeaker = badge.speaker as Record<string, unknown> | undefined
  const isUsableSpeaker =
    !!rawSpeaker &&
    typeof rawSpeaker === 'object' &&
    typeof rawSpeaker._id === 'string' &&
    typeof rawSpeaker.name === 'string' &&
    typeof rawSpeaker.email === 'string'
  if (!isUsableSpeaker) {
    return {
      success: false,
      reason: 'error',
      error: 'Badge speaker data unavailable',
    }
  }
  const speaker = rawSpeaker as {
    _id: string
    name: string
    email: string
    slug?: string
  }

  const { conferenceYear, conferenceDate } =
    deriveBadgeConferenceFields(conference)

  const config = await createBadgeConfiguration(conference, domain)

  const { talkId, talkTitle } =
    badge.badgeType === 'speaker'
      ? await resolveAcceptedTalk(speaker._id, conference._id)
      : {}

  try {
    return await regenerateAndPatch()
  } catch (err) {
    // generateBadgeArtifacts/createBadgeConfiguration can throw (signing key
    // material, canvas failures); the mutation contract is a STRUCTURED
    // result, never an unexpected tRPC internal error.
    console.error('rebakeBadge failed:', err)
    return {
      success: false,
      reason: 'error',
      error: err instanceof Error ? err.message : 'Rebake failed',
    }
  }

  async function regenerateAndPatch(): Promise<RebakeBadgeResult> {
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
          badgeType: badge!.badgeType,
          // Custom center graphic stored at issuance (absent on badges issued
          // before the field existed — those rebake with the default).
          centerGraphicSvg: badge!.centerGraphicSvg,
          talkId,
          talkTitle,
        },
        config,
        // Preserve the identity: same badgeId (⇒ same verificationUrl) and
        // the ORIGINAL achievement date — preferring the previously SIGNED
        // credential's own validFrom (pre-unification badges can have
        // issuedAt drift from it by milliseconds; the signed value is the
        // source of truth). The proof's `created` is minted now.
        {
          badgeId: badge!.badgeId,
          validFrom: storedValidFrom(badge!.badgeJson) ?? badge!.issuedAt,
        },
      )

    const { assetId, error: uploadError } = await uploadBadgeSVGAsset(
      bakedSvg,
      `badge-${speaker!.name.replace(/\s+/g, '-').toLowerCase()}-${badge!.badgeId}.svg`,
    )
    if (uploadError || !assetId) {
      return {
        success: false,
        reason: 'error',
        error: 'Failed to upload badge SVG',
      }
    }

    const { badge: updated, error: patchError } = await patchBadgeArtifacts(
      badge!.badgeId,
      {
        badgeJson: JSON.stringify(credentialJson),
        badgeJwt: credentialJwt,
        bakedSvgAssetId: assetId,
        generatorVersion: BADGE_GENERATOR_VERSION,
      },
    )
    if (patchError || !updated) {
      // The new asset is referenced by nothing — best-effort cleanup so a
      // failed patch doesn't orphan it in the dataset.
      await deleteBadgeSVGAsset(assetId).catch(() => undefined)
      return {
        success: false,
        reason: 'error',
        error: 'Failed to update badge record',
      }
    }

    return { success: true, badge: updated }
  }
}
