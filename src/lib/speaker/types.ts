import { FormError, ProposalExisting } from '@/lib/proposal/types'

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

export interface SpeakerRef {
  _type: string
  _ref: string
}

interface SpeakerBase {
  name: string
  slug?: string
  title?: string
  bio?: string
  image?: string
  links?: string[]
  flags?: Flags[]
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SpeakerInput extends SpeakerBase {}

export interface Speaker extends SpeakerBase {
  _id: string
  _rev: string
  _createdAt: string
  _updatedAt: string
  email: string
  providers?: string[]
  imageURL?: string
  is_organizer?: boolean
}

export interface SpeakerWithTalks extends Speaker {
  talks?: ProposalExisting[]
}

export interface SpeakerWithReviewInfo extends Speaker {
  submittedTalks?: ProposalExisting[]
  previousAcceptedTalks?: ProposalExisting[]
}

export interface SpeakerResponse {
  speaker?: Speaker
  error?: FormError
  status: number
}
