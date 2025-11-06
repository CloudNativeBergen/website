/**
 * OpenBadges v3.0 Badge Generator
 *
 * Generates OpenBadges v3.0 compliant JSON-LD credentials with
 * Data Integrity Proofs using Ed25519 signatures.
 */

import { signBadgeData, getVerificationMethod } from './crypto'
import type {
  BadgeAssertion,
  BadgeCredential,
  BadgeGenerationParams,
} from './types'
import { getCurrentDateTime } from '@/lib/time'
import type { Conference } from '@/lib/conference/types'

/**
 * Generate a unique badge ID
 */
export function generateBadgeId(): string {
  return `badge-${Date.now()}-${Math.random().toString(36).substring(7)}`
}

/**
 * Generate OpenBadges v3.0 credential JSON-LD
 */
export async function generateBadgeCredential(
  params: BadgeGenerationParams,
  conference: Conference,
): Promise<{ assertion: BadgeAssertion; badgeId: string }> {
  const {
    speakerName,
    speakerEmail,
    speakerSlug,
    conferenceTitle,
    // conferenceYear is in params for SVG generation and emails but not needed here
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    conferenceYear,
    badgeType,
    issuerUrl,
    talkId,
    talkTitle,
  } = params

  const badgeId = generateBadgeId()
  const issuedAt = getCurrentDateTime()

  // Use conference contact email or fallback to extracting domain
  const issuerEmail =
    conference.contact_email ||
    (conference.domains?.[0]
      ? `contact@${conference.domains[0]}`
      : 'contact@cloudnativebergen.dev')

  // Build evidence array for OB 3.0 compliance
  const evidence: Array<{
    id: string
    type: string[]
    name: string
    description?: string
  }> = []

  // Add speaker profile as evidence (if slug available)
  if (speakerSlug) {
    evidence.push({
      id: `${issuerUrl}/speaker/${speakerSlug}`,
      type: ['Evidence'],
      name: `${speakerName} Speaker Profile`,
      description: `Public speaker profile for ${speakerName} at ${conferenceTitle}`,
    })
  }

  // Add talk/presentation as evidence for speaker badges
  if (badgeType === 'speaker' && talkId && talkTitle) {
    evidence.push({
      id: `${issuerUrl}/program#talk-${talkId}`,
      type: ['Evidence'],
      name: talkTitle,
      description: `Talk presented by ${speakerName} at ${conferenceTitle}`,
    })
  }

  // Enhanced issuer profile with description
  const issuerDescription =
    conference.description ||
    `${conference.organizer} hosts ${conferenceTitle}, bringing together the cloud native community in ${conference.city}, ${conference.country}.`

  // Create the achievement/badge class
  const achievement: BadgeCredential = {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    ],
    id: `${issuerUrl}/api/badge/${badgeId}/achievement`,
    type: ['Achievement'],
    name: `${badgeType === 'speaker' ? 'Speaker' : 'Organizer'} at ${conferenceTitle}`,
    description: `This badge recognizes ${speakerName} as a ${badgeType} at ${conferenceTitle}, demonstrating their contribution to the cloud native community in Bergen, Norway.`,
    image: {
      id: `${issuerUrl}/api/badge/${badgeId}/image`,
      type: 'Image',
      caption: `${conferenceTitle} ${badgeType === 'speaker' ? 'Speaker' : 'Organizer'} Badge`,
    },
    criteria: {
      narrative:
        badgeType === 'speaker'
          ? `Presented a talk or workshop at ${conferenceTitle}, sharing expertise with the cloud native community.`
          : `Served as an organizer for ${conferenceTitle}, helping to create a successful community event.`,
    },
    issuer: {
      id: `${issuerUrl}`,
      type: ['Profile'],
      name: conference.organizer,
      url: issuerUrl,
      email: issuerEmail,
      description: issuerDescription,
      image: {
        id: `${issuerUrl}/og/base.png`,
        type: 'Image',
      },
    },
    ...(evidence.length > 0 && { evidence }),
  }

  // Create the assertion (credential subject)
  const assertion: BadgeAssertion = {
    '@context': [
      'https://www.w3.org/ns/credentials/v2',
      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
    ],
    id: `${issuerUrl}/api/badge/${badgeId}`,
    type: ['VerifiableCredential', 'AchievementCredential'],
    credentialSubject: {
      id: `mailto:${speakerEmail}`,
      type: ['AchievementSubject'],
      achievement,
    },
    issuer: {
      id: issuerUrl,
      type: ['Profile'],
      name: conference.organizer,
      url: issuerUrl,
      description: issuerDescription,
      image: {
        id: `${issuerUrl}/og/base.png`,
        type: 'Image',
      },
    },
    validFrom: issuedAt,
    name: `${badgeType === 'speaker' ? 'Speaker' : 'Organizer'} Badge for ${conferenceTitle}`,
  }

  // Create Data Integrity Proof (as array per OB 3.0 schema)
  const proofValue = await signBadgeData(assertion)

  assertion.proof = [
    {
      type: 'DataIntegrityProof',
      created: issuedAt,
      verificationMethod: getVerificationMethod(conference.domains),
      cryptosuite: 'eddsa-rdfc-2022',
      proofPurpose: 'assertionMethod',
      proofValue,
    },
  ]

  // Validate schema compliance before returning
  const { assertValidBadge } = await import('./schema-validator')
  assertValidBadge(assertion)

  return {
    assertion,
    badgeId,
  }
}

/**
 * Validate badge assertion structure
 */
export function validateBadgeAssertion(assertion: unknown): boolean {
  if (!assertion || typeof assertion !== 'object') {
    return false
  }

  const a = assertion as Partial<BadgeAssertion>

  // Check required fields
  if (
    !a['@context'] ||
    !Array.isArray(a['@context']) ||
    !a.id ||
    !a.type ||
    !Array.isArray(a.type) ||
    !a.credentialSubject ||
    !a.issuer ||
    !a.validFrom
  ) {
    return false
  }

  // Check types
  if (
    !a.type.includes('VerifiableCredential') ||
    !a.type.includes('AchievementCredential')
  ) {
    return false
  }

  return true
}
