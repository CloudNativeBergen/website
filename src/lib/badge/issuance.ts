import type { BadgeType } from './types'
import {
  deriveBadgeConferenceFields,
  generateBadgeArtifacts,
} from './artifacts'
import { createBadgeConfiguration } from './config'
import { getCurrentDateTime } from '@/lib/time'
import { getSpeaker } from '@/lib/speaker/sanity'
import { createBadge, uploadBadgeSVGAsset, checkBadgeExists } from './sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { getPlatformOrgId } from '@/lib/authz/platform'
import { BADGE_GENERATOR_VERSION } from './version'

/**
 * The accepted/confirmed talk that seeds a SPEAKER badge's talk evidence.
 * Shared by issuance and rebake so both derive the same evidence from the same
 * source of truth. Returns empty fields for organizer badges (no talk) or when
 * the speaker has no qualifying talk.
 */
export async function resolveAcceptedTalk(
  speakerId: string,
  conferenceId: string,
): Promise<{ talkId?: string; talkTitle?: string }> {
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
    { speakerId, conferenceId },
  )
  return acceptedTalk
    ? { talkId: acceptedTalk._id, talkTitle: acceptedTalk.title }
    : {}
}

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

  // PLATFORM-ORG TRIPWIRE (Phase 0, RunKonf/platform#46). Badge credentials are
  // signed with ONE GLOBAL key pair shared by every tenant (config.ts:113-115),
  // and issued Open Badge bytes verify PERMANENTLY on platforms we do not control
  // (Credly, 1EdTech, LinkedIn) — a badge minted for a second tenant on the global
  // keys could never be un-issued or re-signed. The per-tenant signing rework
  // (platform#46) is deliberately DEFERRED until a second tenant is about to issue;
  // this gate makes that deferral safe by turning the otherwise SILENT trigger (a
  // non-platform org's first badge succeeding on the global keys) into an explicit
  // refusal. This is the issuance chokepoint: both `issue` and `bulkIssue` — and
  // any future caller — route through here, so the gate cannot be bypassed. The
  // issuing org is derived from the domain-authoritative `conferenceId` (the same
  // tenant key the authz waist gated on, trpc.ts:150-168), never from client input.
  // FAIL CLOSED: an unresolvable platform org (PLATFORM_ORG_SLUG unset / unknown /
  // transient) OR an unresolvable issuing org DENIES — an unresolvable guard input
  // must never allow (the scopedFetch fail-open lesson). Relaxes at Phase 2 to
  // "org must have resolvable per-tenant signing keys".
  const platformOrgId = await getPlatformOrgId()
  if (!platformOrgId) {
    return {
      success: false,
      error:
        'Badge issuance is unavailable: the platform organization could not be resolved — see RunKonf/platform#46',
    }
  }
  {
    const { clientReadUncached } = await import('@/lib/sanity/client')
    const issuingOrgId = await clientReadUncached.fetch<string | null>(
      // groq-global-scoped: a by-id read of the conference's OWN org from the
      // domain-authoritative conferenceId (the tenant key the authz waist gated
      // on), compared against the platform org id for the Phase 0 tripwire.
      `*[_type == "conference" && _id == $conferenceId][0].organization._ref`,
      { conferenceId },
    )
    if (issuingOrgId !== platformOrgId) {
      return {
        success: false,
        error:
          'Badge issuance for this organization requires per-tenant signing keys — see RunKonf/platform#46',
      }
    }
  }

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

  if (badgeType === 'organizer') {
    // ORG-SCOPED eligibility (E11, #642): an organizer badge may only be issued
    // to someone who organizes a conference IN THIS conference's org — not the
    // deprecated GLOBAL `speaker.isOrganizer` (true for an organizer of ANY org),
    // which let an org-A admin mint an org-A organizer badge for an org-B-only
    // organizer. Resolve the org from the (authoritative, domain-derived)
    // conferenceId; a null org denies (fail closed).
    const { clientReadUncached } = await import('@/lib/sanity/client')
    const orgRef = await clientReadUncached.fetch<string | null>(
      `*[_type == "conference" && _id == $conferenceId][0].organization._ref`,
      { conferenceId },
    )
    const isOrgOrganizer = orgRef
      ? await clientReadUncached.fetch<boolean>(
          `count(*[_type == "conference" && organization._ref == $orgRef && $speakerId in organizers[]._ref]) > 0`,
          { orgRef, speakerId: speaker._id },
        )
      : false
    if (!isOrgOrganizer) {
      return {
        success: false,
        error: `Not eligible: ${speaker.name} is not an organizer`,
      }
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

  const { conferenceYear, conferenceDate } =
    deriveBadgeConferenceFields(conference)

  const config = await createBadgeConfiguration(conference, domain)

  const { talkId, talkTitle } =
    badgeType === 'speaker'
      ? await resolveAcceptedTalk(speaker._id, conferenceId)
      : {}

  // ONE timestamp: the credential's validFrom and the stored issuedAt must be
  // the same instant (a rebake later reuses issuedAt as validFrom).
  const issuedAt = getCurrentDateTime()

  const { credentialJson, credentialJwt, badgeId, bakedSvg, verificationUrl } =
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
        badgeType,
        centerGraphicSvg,
        talkId,
        talkTitle,
      },
      config,
      { validFrom: issuedAt },
    )

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
    issuedAt,
    // Stored so an in-place rebake reproduces the visual identity.
    ...(centerGraphicSvg ? { centerGraphicSvg } : {}),
    badgeJson: JSON.stringify(credentialJson),
    badgeJwt: credentialJwt,
    bakedSvgAssetId: assetId,
    verificationUrl,
    generatorVersion: BADGE_GENERATOR_VERSION,
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
