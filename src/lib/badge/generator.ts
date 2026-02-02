import { signCredentialJWT, createCredential } from '@/lib/openbadges'
import { getCurrentDateTime } from '@/lib/time'
import type { BadgeGenerationParams, BadgeConfiguration } from './types'

/**
 * Generate a badge credential with pure function design
 *
 * This function accepts all required configuration through the BadgeConfiguration
 * parameter, making it pure and testable without environment variable dependencies.
 *
 * @param params - Badge generation parameters (speaker info, talk info, etc.)
 * @param config - Badge configuration (keys, URLs, issuer info)
 * @returns Promise resolving to assertion JWT and badge ID
 *
 * @example
 * ```typescript
 * const config = await createBadgeConfiguration(conference, domain)
 * const badge = await generateBadgeCredential(params, config)
 * // badge.assertion is the signed JWT credential
 * // badge.badgeId is the unique identifier
 * ```
 */
export async function generateBadgeCredential(
  params: BadgeGenerationParams,
  config: BadgeConfiguration,
): Promise<{ assertion: string; badgeId: string }> {
  const {
    speakerName,
    speakerEmail,
    speakerSlug,
    conferenceTitle,
    badgeType,
    talkId,
    talkTitle,
  } = params

  const badgeId = crypto.randomUUID()
  const issuedAt = getCurrentDateTime()

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

  const credential = createCredential({
    credentialId: `${config.baseUrl}/api/badge/${badgeId}`,
    name: `${badgeType === 'speaker' ? 'Speaker' : 'Organizer'} Badge for ${conferenceTitle}`,
    subject: {
      id: `mailto:${speakerEmail}`,
      type: ['AchievementSubject'],
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
      ...(evidence.length > 0 && { evidence }),
    },
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

  const jwt = await signCredentialJWT(credential, config.signing)

  return {
    assertion: jwt,
    badgeId,
  }
}
