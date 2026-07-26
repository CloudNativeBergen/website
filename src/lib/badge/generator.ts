import {
  signCredential,
  signCredentialJWT,
  createCredential,
} from '@/lib/openbadges'
import type { SignedCredential } from '@/lib/openbadges'
import { getCurrentDateTime } from '@/lib/time'
import type { BadgeGenerationParams, BadgeConfiguration } from './types'

/**
 * Generate a badge credential with pure function design
 *
 * This function accepts all required configuration through the BadgeConfiguration
 * parameter, making it pure and testable without environment variable dependencies.
 *
 * The credential is signed in BOTH supported proof formats:
 * - `credentialJson`: JSON-LD with an embedded Data Integrity Proof
 *   (eddsa-rdfc-2022). This is the primary format — it is what certified
 *   OB 3.0 displayers such as Credly verify, and what gets baked into the SVG.
 * - `credentialJwt`: RS256 Compact JWS for the 1EdTech OB30Inspector validator.
 *
 * @param params - Badge generation parameters (speaker info, talk info, etc.)
 * @param config - Badge configuration (keys, URLs, issuer info)
 * @param options - Optional identity overrides. On a fresh issuance both are
 *   omitted and a new `badgeId`/`validFrom` (now) are minted. On a REBAKE the
 *   caller passes the STORED `badgeId` (so the verification URL and any shared /
 *   Credly links keep resolving) and the STORED `validFrom` (so the achievement
 *   date does not shift). The proof's `created` timestamp is always minted now
 *   by the signing layer — a rebake re-mints the proof but preserves the claim.
 * @returns Promise resolving to both signed formats and the badge ID
 *
 * @example
 * ```typescript
 * const config = await createBadgeConfiguration(conference, domain)
 * const badge = await generateBadgeCredential(params, config)
 * // badge.credentialJson is the embedded-proof credential (object)
 * // badge.credentialJwt is the signed JWT credential (string)
 * // badge.badgeId is the unique identifier
 * ```
 */
export async function generateBadgeCredential(
  params: BadgeGenerationParams,
  config: BadgeConfiguration,
  options?: { badgeId?: string; validFrom?: string },
): Promise<{
  credentialJson: SignedCredential
  credentialJwt: string
  badgeId: string
}> {
  const {
    speakerName,
    speakerEmail,
    speakerSlug,
    conferenceTitle,
    badgeType,
    talkId,
    talkTitle,
  } = params

  const badgeId = options?.badgeId ?? crypto.randomUUID()
  // validFrom is the achievement date. Preserve it verbatim on a rebake; mint
  // now on a fresh issuance.
  const issuedAt = options?.validFrom ?? getCurrentDateTime()

  const evidence: Array<{
    id: string
    type: string[]
    name: string
    description?: string
  }> = []

  if (speakerSlug) {
    evidence.push({
      id: `${config.baseUrl}/speaker/${speakerSlug}`,
      type: ['Evidence'],
      name: `${speakerName} Speaker Profile`,
      description: `Public speaker profile for ${speakerName} at ${conferenceTitle}`,
    })
  }

  if (badgeType === 'speaker' && talkId && talkTitle) {
    evidence.push({
      id: `${config.baseUrl}/program#talk-${talkId}`,
      type: ['Evidence'],
      name: talkTitle,
      description: `Talk presented by ${speakerName} at ${conferenceTitle}`,
    })
  }

  // One normalization for every email-derived member (mailto id + identifier).
  const normalizedEmail = speakerEmail.trim().toLowerCase()

  const credential = createCredential({
    credentialId: `${config.baseUrl}/api/badge/${badgeId}`,
    name: `${badgeType === 'speaker' ? 'Speaker' : 'Organizer'} Badge for ${conferenceTitle}`,
    subject: {
      id: `mailto:${normalizedEmail}`,
      type: ['AchievementSubject'],
      // Recipient identity for ownership matching on import. Displayers such as
      // Credly match a badge to a signed-in user via credentialSubject
      // .identifier[] (IdentityObject), not by parsing the mailto: subject id.
      // ONE normalization (trim+lowercase) feeds BOTH the mailto: id and this
      // identifier, so a case-sensitive comparison by a displayer can never
      // see two spellings of the same address. hashed:false keeps
      // the plaintext value — no new PII exposure since the mailto: id already
      // carries the email; a salted sha256 hash is the future privacy option.
      identifier: [
        {
          type: 'IdentityObject',
          hashed: false,
          identityHash: normalizedEmail,
          identityType: 'emailAddress',
        },
      ],
    },
    achievement: {
      id: `${config.baseUrl}/api/badge/${badgeId}/achievement`,
      name: `${badgeType === 'speaker' ? 'Speaker' : 'Organizer'} at ${conferenceTitle}`,
      description: `This badge recognizes ${speakerName} as ${badgeType === 'speaker' ? 'a speaker' : 'an organizer'} at ${conferenceTitle}, demonstrating their contribution to the cloud native community.`,
      image: {
        id: `${config.baseUrl}/api/badge/${badgeId}/image`,
        type: 'Image',
        caption: `${conferenceTitle} ${badgeType === 'speaker' ? 'Speaker' : 'Organizer'} Badge`,
      },
      criteria: {
        narrative:
          badgeType === 'speaker'
            ? `Presented a talk or workshop at ${conferenceTitle}, sharing expertise with the cloud native community.`
            : `Served as an organizer for ${conferenceTitle}, helping to create a successful community event.`,
      },
    },
    // Evidence belongs at the credential top level per VC 2.0 / OB 3.0
    ...(evidence.length > 0 && { evidence }),
    issuer: {
      id: config.issuer.id,
      name: config.issuer.name,
      url: config.issuer.url,
      email: config.issuer.email,
      description: config.issuer.description,
      image: config.issuer.imageUrl
        ? {
            id: config.issuer.imageUrl,
            type: 'Image',
          }
        : undefined,
    },
    validFrom: issuedAt,
  })

  // Primary format: embedded Data Integrity Proof (eddsa-rdfc-2022)
  const credentialJson = await signCredential(credential, {
    privateKey: config.signing.ed25519Seed,
    verificationMethod: config.signing.embeddedVerificationMethod,
  })

  // Secondary format: RS256 JWT for the 1EdTech validator
  const credentialJwt = await signCredentialJWT(credential, config.signing)

  return {
    credentialJson,
    credentialJwt,
    badgeId,
  }
}
