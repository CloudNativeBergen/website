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

/**
 * The ticket figures the weekly Slack post states. DELIBERATELY SMALLER than
 * `/admin/tickets`: it carries what this cheap read can establish, and nothing
 * it would have to guess.
 *
 * It used to carry `sponsorTickets: 0` (hardcoded) plus a claimed count and rate
 * taken from `freeTickets.length` — the price test `lib/tickets/classification`
 * exists to remove. A sponsor comp is a 100%-off REDEMPTION, so the price test
 * counts none of them and counts every zero-priced ordinary ticket instead; with
 * the admin page moved onto per-category sources, the two surfaces reported
 * different free-ticket numbers for the same event, and the Slack one reached
 * the organizer unprompted.
 *
 * Counting claims properly needs the event's discount list, the speaker
 * invitation records and each sponsor tier's allowance — see
 * `lib/tickets/freeAllocation`, which `/admin/tickets` assembles. Until this
 * section does the same, it states the allocations it can read and omits claims
 * rather than stating a number known to be wrong.
 */
export interface TicketSummary {
  paidTickets: number
  totalRevenue: number
  totalTickets: number
  speakerTickets: number
  organizerTickets: number
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
