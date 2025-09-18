import { Reference, TypedObject } from 'sanity'
import { Format, ProposalExisting } from '@/lib/proposal/types'
import { Speaker, SpeakerWithTalks } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import {
  SponsorTier,
  ConferenceSponsor,
  ConferenceSponsorWithContact,
} from '@/lib/sponsor/types'
import type { TicketTargetConfig } from '@/lib/tickets/types'

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
  cfp_email: string
  program_date: string
  registration_link?: string
  registration_enabled: boolean
  contact_email: string
  checkin_customer_id?: number
  checkin_event_id?: number
  ticket_capacity?: number
  ticket_targets?: TicketTargetConfig
  social_links?: string[]
  organizers: Speaker[]
  featured_speakers?: SpeakerWithTalks[]
  featured_talks?: ProposalExisting[]
  domains: string[]
  formats: Format[]
  topics: Topic[]
  sponsors?: ConferenceSponsor[] | ConferenceSponsorWithContact[]
  sponsor_tiers?: SponsorTier[]
  schedules?: ConferenceSchedule[]
  vanity_metrics?: ConferenceVanityMetric[]
  features?: string[]
}
