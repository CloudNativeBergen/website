import type { SponsorPipelineData } from '@/lib/sponsor-crm/pipeline'

export interface ProposalSummary {
  total: number
  submitted: number
  accepted: number
  confirmed: number
  rejected: number
  withdrawn: number
  byStatus: Record<string, number>
}

export interface TicketSummary {
  paidTickets: number
  totalRevenue: number
  totalTickets: number
  sponsorTickets: number
  speakerTickets: number
  organizerTickets: number
  freeTicketsClaimed: number
  freeTicketClaimRate: number
  categoryBreakdown: Record<string, number>
}

export interface TargetProgress {
  currentPercentage: number
  targetPercentage: number
  variance: number
  isOnTrack: boolean
  capacity: number
  nextMilestone: {
    label: string
    daysAway: number
  } | null
}

export interface SectionError {
  section: string
  message: string
}

export interface ConferenceStatusSummary {
  conferenceTitle: string
  lastUpdated: string
  sponsors: SponsorPipelineData | null
  proposals: ProposalSummary | null
  tickets: TicketSummary | null
  targetProgress: TargetProgress | null
  errors: SectionError[]
}
