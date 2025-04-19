import { ProposalExisting } from "../proposal/types"
import { Speaker } from "../speaker/types"

export interface TrackTalk {
  talk?: ProposalExisting
  placeholder?: string
  startTime: string
  endTime: string
}
export interface ScheduleTrack {
  trackTitle: string
  trackDescription: string
  talks: Array<TrackTalk>
}
export interface ConferenceSchedule {
  _id: string
  date: string
  tracks: Array<ScheduleTrack>
}

export interface ConferenceVanityMetric {
  label: string
  value: string
}

export interface ConferenceSponsor {
  sponsor: {
    name: string
    website: string
    logo: string
  }
}

export interface SponsorTier {
  title: string
  tagline: string
  price: Array<{
    amount: number
    currency: string
  }>
  perks: Array<{
    label: string
    description: string
  }>
  sold_out: boolean
  most_popular: boolean
}

export interface Conference {
  title: string
  organizer: string
  city: string
  country: string
  venue_name?: string
  venue_address?: string
  tagline?: string
  description?: string
  start_date?: string
  end_date?: string
  cfp_start_date?: string
  cfp_end_date?: string
  cfp_notify_date?: string
  program_date?: string
  coc_link?: string
  registration_link?: string
  registration_enabled: boolean
  contact_email: string
  social_links?: string[]
  organizers?: Speaker[]
  domains?: string[]
  sponsors?: Array<ConferenceSponsor>
  sponsor_tiers?: Array<SponsorTier>
  schedules?: Array<ConferenceSchedule>
  vanity_metrics?: Array<ConferenceVanityMetric>
  features?: string[]
}
