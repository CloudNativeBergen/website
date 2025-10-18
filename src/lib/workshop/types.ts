import type { SanityDocument } from 'sanity'
import type { ProposalExisting, Level } from '@/lib/proposal/types'
import type { Conference } from '@/lib/conference/types'

export enum WorkshopSignupStatus {
  CONFIRMED = 'confirmed',
  WAITLIST = 'waitlist',
}

export const workshopSignupStatuses = new Map<WorkshopSignupStatus, string>([
  [WorkshopSignupStatus.CONFIRMED, 'Confirmed'],
  [WorkshopSignupStatus.WAITLIST, 'Waitlist'],
])

export type ExperienceLevel = Level
export type OperatingSystem = 'windows' | 'macos' | 'linux'

export interface WorkshopSignup {
  userEmail: string
  userName: string
  userWorkOSId: string
  experienceLevel: ExperienceLevel
  operatingSystem: OperatingSystem
  workshop: {
    _type: 'reference'
    _ref: string
    _id?: string
    title?: string
    duration?: number
    capacity?: number
    date?: string
    startTime?: string
    endTime?: string
  }
  conference: {
    _type: 'reference'
    _ref: string
    _id?: string
    name?: string
    year?: string
  }
  status: WorkshopSignupStatus
  signedUpAt?: string
  signupDate?: string
  confirmedAt?: string
  cancelledAt?: string
  confirmationEmailSent?: boolean
  notes?: string
}

export type { WorkshopSignupInput } from '@/server/schemas/workshop'

export interface WorkshopSignupExisting extends WorkshopSignup, SanityDocument {
  _id: string
  _rev: string
  _type: 'workshopSignup'
  _createdAt: string
  _updatedAt: string
}

export interface WorkshopSignupResponse {
  success: boolean
  signup?: WorkshopSignupExisting
  error?: string
  message?: string
}

export interface WorkshopSignupListResponse {
  success: boolean
  signups: WorkshopSignupExisting[]
  total: number
  error?: string
}

export interface WorkshopSignupActionResponse {
  success: boolean
  message: string
  signup?: WorkshopSignupExisting
  error?: string
}

export interface WorkshopSignupFormError {
  userEmail?: string
  userName?: string
  workshop?: string
  conference?: string
  general?: string
}

export interface WorkshopSignupValidationError {
  field: keyof WorkshopSignup
  message: string
}

export interface WorkshopSignupFilters {
  conferenceId?: string
  workshopId?: string
  status?: WorkshopSignupStatus
  userEmail?: string
  startDate?: string
  endDate?: string
}

export interface CancelWorkshopSignupRequest {
  signupId: string
  reason?: string
}

export interface ConfirmWorkshopSignupRequest {
  signupId: string
  sendEmail?: boolean
}

export interface ResendConfirmationRequest {
  signupId: string
}

export interface WorkshopSignupFormData {
  userEmail: string
  userName: string
  userWorkOSId: string
  experienceLevel: ExperienceLevel
  operatingSystem: OperatingSystem
  workshopId: string
  conferenceId: string
  notes?: string
}

export interface ProposalWithWorkshopData
  extends Omit<ProposalExisting, 'speakers' | 'topics' | 'conference'> {
  capacity: number
  speakers: import('@/lib/speaker/types').Speaker[]
  topics?: import('@/lib/topic/types').Topic[]
  conference: import('@/lib/conference/types').Conference
  signups: number
  available: number
  waitlistCount?: number
  date?: string
  startTime?: string
  endTime?: string
  room?: string
  scheduleInfo?: {
    date?: string
    timeSlot?: {
      startTime?: string
      endTime?: string
    }
    room?: string
  }
}

export interface WorkshopAvailability {
  workshopId: string
  workshopTitle: string
  capacity: number
  signedUp: number
  available: number
  isFull: boolean
  waitlistCount?: number
}

export interface WorkshopSignupWithReferences extends WorkshopSignupExisting {
  workshopDetails?: ProposalExisting
  conferenceDetails?: Conference
}

export interface WorkshopSignupSummary {
  conferenceId: string
  totalSignups: number
  confirmedSignups: number
  waitlistSignups: number
  workshops: {
    id: string
    title: string
    signupCount: number
    capacity: number
  }[]
}
