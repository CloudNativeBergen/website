import { signCredentialJWT, createCredential } from '@/lib/openbadges'
import { getCurrentDateTime } from '@/lib/time'
import type { Conference } from '@/lib/conference/types'
import type { BadgeGenerationParams } from './types'

function getBadgeKeys(): { privateKey: string; publicKey: string } {
  const privateKey = process.env.BADGE_ISSUER_RSA_PRIVATE_KEY
  const publicKey = process.env.BADGE_ISSUER_RSA_PUBLIC_KEY

  if (!privateKey || !publicKey) {
    throw new Error(
      'Badge issuer RSA keys must be set in environment. ' +
        'Set BADGE_ISSUER_RSA_PRIVATE_KEY and BADGE_ISSUER_RSA_PUBLIC_KEY',
    )
  }

  return { privateKey, publicKey }
}
function generateBadgeId(): string {
  return crypto.randomUUID()
}

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

  const issuerEmail =
    conference.contact_email ||
    (conference.domains?.[0]
      ? `contact@${conference.domains[0]}`
      : 'contact@cloudnativebergen.dev')

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

  const issuerDescription =
    conference.description ||
    `${conference.organizer} hosts ${conferenceTitle}, bringing together the cloud native community in ${conference.city}, ${conference.country}.`

  const { publicKey, privateKey } = getBadgeKeys()
  // Issuer ID should be the organization's base URL, matching the issuer profile endpoint
  const issuerId = baseUrl
  const verificationMethod = `${baseUrl}/api/badge/issuer#key-1`

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
      description: `This badge recognizes ${speakerName} as ${badgeType === 'speaker' ? 'a speaker' : 'an organizer'} at ${conferenceTitle}, demonstrating their contribution to the cloud native community in Bergen, Norway.`,
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
      id: issuerId,
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

  const jwt = await signCredentialJWT(credential, {
    privateKey,
    publicKey,
    verificationMethod,
  })

  return {
    assertion: jwt,
    badgeId,
  }
}
