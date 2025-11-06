import type { Speaker } from '@/lib/speaker/types'
import type { Conference } from '@/lib/conference/types'

export type BadgeType = 'speaker' | 'organizer'

export interface BadgeCredential {
  '@context': string[]
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
    type: string
    name: string
    url: string
    email?: string
    description?: string
    image?: string
  }
  evidence?: Array<{
    id: string
    type: string[]
    name: string
    description?: string
  }>
}

export interface BadgeAssertion {
  '@context': string[]
  id: string
  type: string[]
  name: string
  credentialSubject: {
    id: string
    type: string
    achievement: BadgeCredential
  }
  issuer: {
    id: string
    type: string
    name: string
    url: string
    description?: string
    image?: string
  }
  validFrom: string
  proof?: {
    type: string
    created: string
    verificationMethod: string
    cryptosuite: string
    proofPurpose: string
    proofValue: string
  }
}

export interface BadgeRecord {
  _id: string
  _createdAt: string
  _updatedAt: string
  badge_id: string
  speaker: Speaker | { _ref: string; _type: 'reference' }
  conference: Conference | { _ref: string; _type: 'reference' }
  badge_type: BadgeType
  issued_at: string
  badge_json: string
  baked_svg?: {
    _type: 'file'
    asset: {
      _ref: string
      _type: 'reference'
      url?: string
    }
  }
  verification_url?: string
  email_sent: boolean
  email_sent_at?: string
  email_id?: string
  email_error?: string
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
  issuerUrl: string
  centerGraphicSvg?: string
  talkId?: string
  talkTitle?: string
}
