import type { SanityDocument } from 'sanity'
import type { ProposalExisting } from '@/lib/proposal/types'
import type { Conference } from '@/lib/conference/types'

// Enums and Constants
export enum WorkshopSignupStatus {
  CONFIRMED = 'confirmed',
  WAITLIST = 'waitlist',
}

export const workshopSignupStatuses = new Map<WorkshopSignupStatus, string>([
  [WorkshopSignupStatus.CONFIRMED, 'Confirmed'],
  [WorkshopSignupStatus.WAITLIST, 'Waitlist'],
])

// Core Interfaces
export interface WorkshopSignupUser {
  email: string
  name: string
  workOSId: string
}

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced'
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

// Re-export WorkshopSignupInput from Zod schemas
export type { WorkshopSignupInput } from '@/server/schemas/workshop'

export interface WorkshopSignupExisting extends WorkshopSignup, SanityDocument {
  _id: string
  _rev: string
  _type: 'workshopSignup'
  _createdAt: string
  _updatedAt: string
}

// Response Interfaces
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

// Validation Types
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

// Helper Types
export interface WorkshopScheduleInfo {
  date?: string
  timeSlot?: {
    startTime?: string
    endTime?: string
  }
  room?: string
}

export interface WorkshopWithCapacity extends ProposalExisting {
  capacity: number
  currentSignups?: number
  availableSlots?: number
  isFull?: boolean
  signupCount?: number
  available: number
  signups: number
  waitlistCount?: number
  duration?: number
  instructor?: string | { name: string }
  requirements?: string[]
  date?: string
  startTime?: string
  endTime?: string
  room?: string
  scheduleInfo?: WorkshopScheduleInfo
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

// Extended Workshop Types
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

// Form Types
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

export interface WorkshopSignupFilters {
  conferenceId?: string
  workshopId?: string
  status?: WorkshopSignupStatus
  userEmail?: string
  startDate?: string
  endDate?: string
}

// Action Types
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
