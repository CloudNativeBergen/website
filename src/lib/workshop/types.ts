import type { SanityDocument } from 'sanity'
import type { ProposalExisting, Level } from '@/lib/proposal/types'

export enum WorkshopSignupStatus {
  CONFIRMED = 'confirmed',
  WAITLIST = 'waitlist',
}

export type ExperienceLevel = Level
export type OperatingSystem = 'windows' | 'macos' | 'linux'

/** Individual workshop statistics returned by getWorkshopStatistics() */
export interface WorkshopStats {
  workshopId: string
  workshopTitle: string
  capacity: number
  totalSignups: number
  confirmedSignups: number
  pendingSignups: number
  waitlistSignups: number
  cancelledSignups: number
  utilization: number
}

/** Aggregate totals returned by getWorkshopStatistics() */
export interface WorkshopStatsTotals {
  totalWorkshops: number
  totalCapacity: number
  totalSignups: number
  uniqueParticipants: number
  totalConfirmed: number
  totalPending: number
  totalWaitlist: number
  totalCancelled: number
  averageUtilization: number
}

/** Return type of getWorkshopStatistics() — used by both admin workshops and dashboard */
export interface WorkshopStatistics {
  workshops: WorkshopStats[]
  totals: WorkshopStatsTotals
}

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
  signedUpAt: string
  confirmedAt?: string
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

export interface ProposalWithWorkshopData extends Omit<
  ProposalExisting,
  'speakers' | 'topics' | 'conference'
> {
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
}
