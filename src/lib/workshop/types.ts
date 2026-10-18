import type { SanityDocument } from 'sanity'
import type { ProposalExisting, Level } from '@/lib/proposal/types'

export enum WorkshopSignupStatus {
  CONFIRMED = 'confirmed',
  WAITLIST = 'waitlist',
}

export type ExperienceLevel = Level

/** A sponsor of the conference (`sponsorForConference`), as a sign-up names it. */
export interface EarlyAccessSponsor {
  _id: string
  name: string | null
}

/**
 * Whose early-access link admitted a sign-up (#1348), as the organizer reads
 * answer it (`EARLY_ACCESS_OF_SIGNUP`). `null`: the sign-up is not early.
 */
export type SignupEarlyAccess = {
  /** `null`: the sponsor is no longer in the conference. */
  sponsor: EarlyAccessSponsor | null
  /** Admitted by its ticket type, with no link: the type. */
  ticketType?: string
} | null
export type OperatingSystem = 'windows' | 'macos' | 'linux'

/**
 * The count a confirm into a full workshop was refused on (#1358): the seats
 * taken now, the capacity, and what the confirm would make it.
 */
export interface FullSeats {
  seatsTaken: number
  capacity: number
  after: number
}

/** Individual workshop statistics returned by getWorkshopStatistics() */
export interface WorkshopStats {
  workshopId: string
  workshopTitle: string
  capacity: number
  totalSignups: number
  confirmedSignups: number
  waitlistSignups: number
  utilization: number
}

/** Aggregate totals returned by getWorkshopStatistics() */
export interface WorkshopStatsTotals {
  totalWorkshops: number
  totalCapacity: number
  totalSignups: number
  uniqueParticipants: number
  totalConfirmed: number
  totalWaitlist: number
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
    speakers?: {
      name: string
      slug?: string
      title?: string
    }[]
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
  /** #1357: a promotion email owed, and the token of the run that paid it. */
  promotionEmailDue?: boolean
  promotionEmailClaim?: string
  notes?: string
  /**
   * The sponsor whose early-access link admitted this sign-up (#1348). Set by
   * the organizer reads that show it; `null` on a sign-up that is not early.
   */
  earlyAccess?: SignupEarlyAccess
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
