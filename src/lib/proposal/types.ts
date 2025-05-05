import { Speaker } from '@/lib/speaker/types'
import { Conference, ConferenceSchedule } from '../conference/types'
import { Topic } from '../topic/types'
import { Reference } from 'sanity'

export enum Language {
  norwegian = 'norwegian',
  english = 'english',
}

export enum Level {
  beginner = 'beginner',
  intermediate = 'intermediate',
  advanced = 'advanced',
}

export enum Format {
  lightning_10 = 'lightning_10',
  presentation_25 = 'presentation_25',
  presentation_45 = 'presentation_45',
}

export enum Status {
  draft = 'draft', // draft by the speaker
  submitted = 'submitted', // submitted by the speaker
  accepted = 'accepted', // accepted by the organizers
  confirmed = 'confirmed', // confirmed by the speaker
  rejected = 'rejected', // rejected by the organizers
  withdrawn = 'withdrawn', // withdrawn by the speaker
}

// Action is an enum that represents the possible actions that can be taken on a proposal.
export enum Action {
  view = 'view',
  edit = 'edit',
  submit = 'submit',
  unsubmit = 'unsubmit',
  accept = 'accept',
  confirm = 'confirm',
  reject = 'reject',
  withdraw = 'withdraw',
}

export interface ActionInput {
  action: Action
  notify?: boolean
  comment?: string
}

interface Proposal {
  title: string
  description: string
  language: Language
  format: Format
  level: Level
  outline: string
  tags?: string[]
  tos: boolean
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ProposalInput extends Proposal { }

export interface ProposalExisting extends Proposal {
  _id: string
  _rev: string
  _type: string
  _createdAt: string
  _updatedAt: string
  status: Status
  speaker?: Speaker | Reference
  schedule?: ConferenceSchedule[]
  conference: Conference | Reference
  topics?: Topic[] | Reference[]
}

export interface ProposalBaseResponse {
  status: number
}

export interface FormError {
  message: string
  type: string
  validationErrors?: FormValidationError[]
}

export interface FormValidationError {
  message: string
  field: string
}

export interface ProposalActionResponse extends ProposalBaseResponse {
  proposalStatus?: Status
  error?: FormError
}

export interface ProposalResponse extends ProposalBaseResponse {
  proposal?: ProposalExisting
  error?: FormError
}

export interface ProposalListResponse extends ProposalBaseResponse {
  proposals?: ProposalExisting[]
  error?: FormError
}

export const statuses = new Map([
  [Status.draft, 'Draft'],
  [Status.submitted, 'Submitted'],
  [Status.accepted, 'Accepted'],
  [Status.rejected, 'Rejected'],
  [Status.confirmed, 'Confirmed'],
  [Status.withdrawn, 'Withdrawn'],
])

export const languages = new Map([
  [Language.norwegian, 'Norwegian'],
  [Language.english, 'English'],
])

export const levels = new Map([
  [Level.beginner, 'Beginner'],
  [Level.intermediate, 'Intermediate'],
  [Level.advanced, 'Advanced'],
])

export const formats = new Map([
  [Format.lightning_10, 'Lightning Talk (10 min)'],
  [Format.presentation_25, 'Presentation (25 min)'],
  [Format.presentation_45, 'Presentation (45 min)'],
])
