import type { SanityDocument } from 'sanity'
import type { ProposalExisting, Level } from '@/lib/proposal/types'

export enum WorkshopSignupStatus {
  CONFIRMED = 'confirmed',
  WAITLIST = 'waitlist',
}

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
