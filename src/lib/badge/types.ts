import type { Speaker } from '@/lib/speaker/types'
import type { Conference } from '@/lib/conference/types'

export type BadgeType = 'speaker' | 'organizer'

// Re-export configuration types for convenience
export type {
  BadgeConfiguration,
  SigningConfiguration,
  IssuerConfiguration,
} from './config'

export interface BadgeCredential {
  id: string
  type: string[]
  name: string
  description: string
  image: {
    id: string
    type: string
    caption?: string
  }
  criteria: {
    narrative: string
  }
  issuer: {
    id: string
    type: string[]
    name: string
    url: string
    email?: string
    description?: string
    image?: {
      id: string
      type: string
    }
  }
}

export interface BadgeAssertion {
  '@context': string[]
  id: string
  type: string[]
  name: string
  credentialSubject: {
    id: string
    type: string[]
    achievement: BadgeCredential
  }
  issuer: {
    id: string
    type: string[]
    name: string
    url: string
    description?: string
    image?: {
      id: string
      type: string
    }
  }
  validFrom: string
  // Per VC 2.0 / OB 3.0: evidence lives at the credential top level
  evidence?: Array<{
    id: string
    type: string[]
    name: string
    description?: string
  }>
  proof?: Array<{
    type: string
    created: string
    verificationMethod: string
    cryptosuite: string
    proofPurpose: string
    proofValue: string
  }>
}

export interface BadgeRecord {
  _id: string
  _createdAt: string
  _updatedAt: string
  badgeId: string
  speaker: Speaker | { _ref: string; _type: 'reference' }
  conference: Conference | { _ref: string; _type: 'reference' }
  badgeType: BadgeType
  issuedAt: string
  /**
   * OpenBadges 3.0 credential. New badges store the embedded-proof JSON-LD
   * credential (stringified). Legacy badges store the raw JWT string —
   * use isJWTFormat() to distinguish.
   */
  badgeJson: string
  /** RS256 JWT credential (only present on badges issued with dual formats) */
  badgeJwt?: string
  bakedSvg?: {
    _type: 'file'
    asset: {
      _ref: string
      _type: 'reference'
      url?: string
    }
  }
  verificationUrl?: string
  emailSent: boolean
  emailSentAt?: string
  emailId?: string
  emailError?: string
}

export interface BadgeGenerationParams {
  speakerId: string
  speakerName: string
  speakerEmail: string
  speakerSlug?: string
  conferenceId: string
  conferenceTitle: string
  conferenceYear: string
  conferenceDate: string
  badgeType: BadgeType
  centerGraphicSvg?: string
  talkId?: string
  talkTitle?: string
}
