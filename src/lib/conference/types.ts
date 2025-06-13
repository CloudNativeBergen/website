import { Reference, TypedObject } from 'sanity'
import { Format, ProposalExisting } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'

export interface ConferenceProposals {
  conference: Conference | Reference
  proposals: ProposalExisting[]
}

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
  tier: {
    title: string
    tagline: string
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
  _id: string
  title: string
  organizer: string
  city: string
  country: string
  venue_name?: string
  venue_address?: string
  tagline?: string
  description?: string
  announcement?: TypedObject[]
  start_date: string
  end_date: string
  cfp_start_date: string
  cfp_end_date: string
  cfp_notify_date: string
  program_date: string
  coc_link: string
  registration_link?: string
  registration_enabled: boolean
  contact_email: string
  checkin_customer_id?: number
  checkin_event_id?: number
  social_links?: string[]
  organizers: Speaker[]
  featured_speakers?: Speaker[]
  domains: string[]
  formats: Format[]
  topics: Topic[]
  sponsors?: ConferenceSponsor[]
  sponsor_tiers?: SponsorTier[]
  schedules?: ConferenceSchedule[]
  vanity_metrics?: ConferenceVanityMetric[]
  features?: string[]
}
