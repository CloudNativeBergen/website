import { Speaker } from '@/lib/speaker/types'
import { Conference, ConferenceSchedule } from '@/lib/conference/types'
import { Topic } from '@/lib/topic/types'
import { PortableTextBlock, Reference } from 'sanity'
import { Review } from '@/lib/review/types'
import { CoSpeakerInvitationMinimal } from '@/lib/cospeaker/types'

export enum Language {
  norwegian = 'norwegian',
  english = 'english',
}

export enum Level {
  beginner = 'beginner',
  intermediate = 'intermediate',
  advanced = 'advanced',
}

export enum Audience {
  developer = 'developer',
  architect = 'architect',
  operator = 'operator',
  manager = 'manager',
  dataEngineer = 'dataEngineer',
  securityEngineer = 'securityEngineer',
  qaEngineer = 'qaEngineer',
  devopsEngineer = 'devopsEngineer',
}

export enum Format {
  lightning_10 = 'lightning_10',
  presentation_20 = 'presentation_20',
  presentation_25 = 'presentation_25',
  presentation_40 = 'presentation_40',
  presentation_45 = 'presentation_45',
  workshop_120 = 'workshop_120',
  workshop_240 = 'workshop_240',
}

export function isWorkshopFormat(format: Format): boolean {
  return format === Format.workshop_120 || format === Format.workshop_240
}

export enum Status {
  draft = 'draft',
  submitted = 'submitted',
  accepted = 'accepted',
  confirmed = 'confirmed',
  rejected = 'rejected',
  withdrawn = 'withdrawn',
  deleted = 'deleted',
}

export enum Action {
  view = 'view',
  edit = 'edit',
  submit = 'submit',
  unsubmit = 'unsubmit',
  accept = 'accept',
  remind = 'remind',
  confirm = 'confirm',
  reject = 'reject',
  withdraw = 'withdraw',
  delete = 'delete',
}

interface Proposal {
  title: string
  description: PortableTextBlock[]
  language: Language
  format: Format
  level: Level
  audiences: Audience[]
  outline: string
  topics?: Topic[] | Reference[]
  tos: boolean
  video?: string
  capacity?: number // Workshop capacity - only applies to workshop formats
}

export interface ProposalInput extends Proposal {
  speakers?: Speaker[] | Reference[]
}

export interface ProposalExisting extends Proposal {
  _id: string
  _rev: string
  _type: string
  _createdAt: string
  _updatedAt: string
  status: Status
  speakers?: Speaker[] | Reference[]
  schedule?: ConferenceSchedule[]
  conference: Conference | Reference
  reviews?: Review[]
  coSpeakerInvitations?: CoSpeakerInvitationMinimal[]
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
  [Status.deleted, 'Deleted'],
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

export const audiences = new Map([
  [Audience.developer, 'Developer'],
  [Audience.architect, 'Architect'],
  [Audience.operator, 'Operator'],
  [Audience.manager, 'Manager'],
  [Audience.dataEngineer, 'Data Engineer'],
  [Audience.securityEngineer, 'Security Engineer'],
  [Audience.qaEngineer, 'QA Engineer'],
  [Audience.devopsEngineer, 'DevOps Engineer'],
])

export const formats = new Map([
  [Format.lightning_10, 'Lightning Talk (10 min)'],
  [Format.presentation_20, 'Presentation (20 min)'],
  [Format.presentation_25, 'Presentation (25 min)'],
  [Format.presentation_40, 'Presentation (40 min)'],
  [Format.presentation_45, 'Presentation (45 min)'],
  [Format.workshop_120, 'Workshop (2 hours)'],
  [Format.workshop_240, 'Workshop (4 hours)'],
])
