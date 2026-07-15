import { ProposalExisting } from '@/lib/proposal/types'
import { GalleryImageWithSpeakers } from '@/lib/gallery/types'

export enum Flags {
  localSpeaker = 'local',
  firstTimeSpeaker = 'first-time',
  diverseSpeaker = 'diverse',
  requiresTravelFunding = 'requires-funding',
}

export const flags = new Map([
  [Flags.localSpeaker, 'Local Speaker'],
  [Flags.firstTimeSpeaker, 'First Time Speaker'],
  [Flags.diverseSpeaker, 'Diverse Speaker'],
  [Flags.requiresTravelFunding, 'Requires Travel Funding'],
])

// Optional self-reported gender presets. Diversity data collected only for
// aggregate reporting. When `preferToSelfDescribe` is chosen, an optional
// free-text value is stored separately in `genderSelfDescribe`.
export const genderOptions = [
  'Woman',
  'Man',
  'Non-binary',
  'Prefer to self-describe',
  'Prefer not to say',
] as const

export type Gender = (typeof genderOptions)[number]

export const genderPreferToSelfDescribe: Gender = 'Prefer to self-describe'

export interface ConsentRecord {
  granted: boolean
  grantedAt?: string
  withdrawnAt?: string
  ipAddress?: string
}

export interface SpeakerConsent {
  dataProcessing?: ConsentRecord
  marketing?: ConsentRecord
  publicProfile?: ConsentRecord
  photography?: ConsentRecord
  privacyPolicyVersion?: string
}

interface SpeakerBase {
  name: string
  slug?: string
  title?: string
  bio?: string
  image?: string
  links?: string[]
  flags?: Flags[]
  gender?: Gender
  genderSelfDescribe?: string
  country?: string
  consent?: SpeakerConsent
  galleryImages?: GalleryImageWithSpeakers[]
}

export type SpeakerInput = SpeakerBase

export interface Speaker extends SpeakerBase {
  _id: string
  _rev: string
  _createdAt: string
  _updatedAt: string
  email: string
  providers?: string[]
  imageURL?: string
  isOrganizer?: boolean
}

export interface SpeakerWithTalks extends Speaker {
  talks?: ProposalExisting[]
}

export interface SpeakerWithReviewInfo extends Speaker {
  submittedTalks?: ProposalExisting[]
  previousAcceptedTalks?: ProposalExisting[]
}
