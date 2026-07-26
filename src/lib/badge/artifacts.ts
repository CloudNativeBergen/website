import { generateBadgeCredential } from './generator'
import { generateBadgeSVG } from './svg'
import { bakeBadge } from '@/lib/openbadges'
import type { SignedCredential } from '@/lib/openbadges'
import type { BadgeGenerationParams, BadgeConfiguration } from './types'
import { formatConferenceDateForBadge } from '@/lib/time'

/**
 * Shared badge GENERATION internals — the code path both issuance and rebake
 * run. It signs the credential (both formats), renders the SVG, and bakes the
 * embedded-proof credential into it.
 *
 * The two callers differ only in bookkeeping, not generation:
 *   - issuance  = build params from source data + generate + CREATE the doc
 *   - rebake    = load the doc + generate (fixed id/date) + PATCH the doc
 *
 * so the generation lives here once. Pass `options.badgeId` /
 * `options.validFrom` on a rebake to hold the badge id (and thus the
 * verification URL) and the achievement date stable while the proof and format
 * are re-minted; omit both on a fresh issuance to mint new ones.
 */
/**
 * Conference display fields for badge generation — ONE derivation shared by
 * issuance and rebake so the two paths can never disagree.
 */
export function deriveBadgeConferenceFields(conference: {
  startDate?: string
}): { conferenceYear: string; conferenceDate: string } {
  return {
    // Year straight from the date string when it's ISO-shaped: bare
    // YYYY-MM-DD parses as UTC midnight, and getFullYear() reads the LOCAL
    // zone — off by one west of UTC on Jan 1. getUTCFullYear as the fallback.
    conferenceYear: conference.startDate
      ? (/^\d{4}/.exec(conference.startDate)?.[0] ??
        new Date(conference.startDate).getUTCFullYear().toString())
      : new Date().getUTCFullYear().toString(),
    conferenceDate: conference.startDate
      ? formatConferenceDateForBadge(conference.startDate)
      : 'TBD',
  }
}

export async function generateBadgeArtifacts(
  params: BadgeGenerationParams,
  config: BadgeConfiguration,
  options?: { badgeId?: string; validFrom?: string },
): Promise<{
  credentialJson: SignedCredential
  credentialJwt: string
  badgeId: string
  bakedSvg: string
  verificationUrl: string
}> {
  const { credentialJson, credentialJwt, badgeId } =
    await generateBadgeCredential(params, config, options)

  const svgContent = generateBadgeSVG({
    conferenceTitle: params.conferenceTitle,
    conferenceYear: params.conferenceYear,
    conferenceDate: params.conferenceDate,
    badgeType: params.badgeType,
    centerGraphicSvg: params.centerGraphicSvg,
  })

  // The verification URL is derived purely from the (preserved-on-rebake)
  // badgeId, so a rebake reproduces the exact same URL.
  const verificationUrl = `${config.baseUrl}/badge/${badgeId}`

  // Bake the embedded-proof credential into the SVG — this is the artifact
  // recipients download and upload to OB 3.0 displayers such as Credly.
  const bakedSvg = bakeBadge(svgContent, credentialJson)

  return { credentialJson, credentialJwt, badgeId, bakedSvg, verificationUrl }
}
