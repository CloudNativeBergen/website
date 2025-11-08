/**
 * Badge Generator
 *
 * Generates OpenBadges 3.0 credentials for conference speakers and organizers.
 * Uses JWT proof format for maximum validator compatibility.
 */

import {
  signCredentialJWT,
  createCredential,
  publicKeyToDidKey,
  generateDidKeyVerificationMethod,
} from '@/lib/openbadges'
import { getCurrentDateTime } from '@/lib/time'
import type { Conference } from '@/lib/conference/types'
import type { BadgeGenerationParams } from './types'

/**
 * Get badge issuer keys from environment
 */
function getBadgeKeys(): { privateKey: string; publicKey: string } {
  const privateKey = process.env.BADGE_ISSUER_PRIVATE_KEY
  const publicKey = process.env.BADGE_ISSUER_PUBLIC_KEY

  if (!privateKey || !publicKey) {
    throw new Error(
      'BADGE_ISSUER_PRIVATE_KEY and BADGE_ISSUER_PUBLIC_KEY must be set in environment',
    )
  }

  return { privateKey, publicKey }
}

/**
 * Generate a badge ID
 */
function generateBadgeId(): string {
  return crypto.randomUUID()
}

/**
 * Generate an OpenBadges 3.0 credential for a conference badge
 * Returns JWT string (Compact JWS format) - this IS the signed credential
 */
export async function generateBadgeCredential(
  params: BadgeGenerationParams,
  conference: Conference,
): Promise<{ assertion: string; badgeId: string }> {
  const {
    speakerName,
    speakerEmail,
    speakerSlug,
    conferenceTitle,
    badgeType,
    baseUrl,
    issuerUrl,
    talkId,
    talkTitle,
  } = params

  const badgeId = generateBadgeId()
  const issuedAt = getCurrentDateTime()

  // Get issuer email
  const issuerEmail =
    conference.contact_email ||
    (conference.domains?.[0]
      ? `contact@${conference.domains[0]}`
      : 'contact@cloudnativebergen.dev')

  // Build evidence array
  const evidence: Array<{
    id: string
    type: string[]
    name: string
    description?: string
  }> = []

  if (speakerSlug) {
    evidence.push({
      id: `${baseUrl}/speaker/${speakerSlug}`,
      type: ['Evidence'],
      name: `${speakerName} Speaker Profile`,
      description: `Public speaker profile for ${speakerName} at ${conferenceTitle}`,
    })
  }

  if (badgeType === 'speaker' && talkId && talkTitle) {
    evidence.push({
      id: `${baseUrl}/program#talk-${talkId}`,
      type: ['Evidence'],
      name: talkTitle,
      description: `Talk presented by ${speakerName} at ${conferenceTitle}`,
    })
  }

  // Create issuer description
  const issuerDescription =
    conference.description ||
    `${conference.organizer} hosts ${conferenceTitle}, bringing together the cloud native community in ${conference.city}, ${conference.country}.`

  // Generate did:key for issuer and verification method
  const { publicKey } = getBadgeKeys()
  const didKey = publicKeyToDidKey(publicKey)
  const verificationMethod = generateDidKeyVerificationMethod(publicKey)

  // Create the credential using OpenBadges library
  const credential = createCredential({
    credentialId: `${baseUrl}/api/badge/${badgeId}`,
    name: `${badgeType === 'speaker' ? 'Speaker' : 'Organizer'} Badge for ${conferenceTitle}`,
    subject: {
      id: `mailto:${speakerEmail}`,
      type: ['AchievementSubject'],
    },
    achievement: {
      id: `${baseUrl}/api/badge/${badgeId}/achievement`,
      name: `${badgeType === 'speaker' ? 'Speaker' : 'Organizer'} at ${conferenceTitle}`,
      description: `This badge recognizes ${speakerName} as a ${badgeType} at ${conferenceTitle}, demonstrating their contribution to the cloud native community in Bergen, Norway.`,
      image: {
        id: `${baseUrl}/api/badge/${badgeId}/image`,
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
      id: didKey,
      name: conference.organizer,
      url: issuerUrl,
      email: issuerEmail,
      description: issuerDescription,
      image: {
        id: `${baseUrl}/og/base.png`,
        type: 'Image',
      },
    },
    validFrom: issuedAt,
  })

  // Sign the credential as JWT (Compact JWS format)
  // This is the recommended format for OpenBadges 3.0 with better validator compatibility
  const { privateKey } = getBadgeKeys()
  const jwt = await signCredentialJWT(credential, {
    privateKey,
    publicKey,
    verificationMethod,
  })

  return {
    assertion: jwt, // JWT string is the complete signed credential
    badgeId,
  }
}
