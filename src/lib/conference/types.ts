import { TypedObject } from 'sanity'
import { Format, ProposalExisting } from '@/lib/proposal/types'
import { Speaker, SpeakerWithTalks } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import { SponsorTier, ConferenceSponsor } from '@/lib/sponsor/types'
import type { SalesTargetConfig } from '@/lib/tickets/types'
import { GalleryImageWithSpeakers } from '@/lib/gallery/types'

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

export interface SponsorBenefit {
  title: string
  description: string
  icon?: string
}

export interface SponsorshipCustomization {
  hero_headline?: string
  hero_subheadline?: string
  package_section_title?: string
  addon_section_title?: string
  philosophy_title?: string
  philosophy_description?: string
  closing_quote?: string
  closing_cta_text?: string
  prospectus_url?: string
}

export interface TicketCustomization {
  hero_headline?: string
  hero_subheadline?: string
  show_vanity_metrics?: boolean
  group_discount_info?: string
  cta_button_text?: string
}

export interface TicketInclusion {
  _key?: string
  title: string
  description?: string
  icon?: string
}

export interface TicketFaq {
  _key?: string
  question: string
  answer: string
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
  logo_bright?: string
  logo_dark?: string
  logomark_bright?: string
  logomark_dark?: string
  announcement?: TypedObject[]
  start_date: string
  end_date: string
  cfp_start_date: string
  cfp_end_date: string
  cfp_notify_date: string
  cfp_email: string
  sponsor_email: string
  program_date: string
  registration_link?: string
  registration_enabled: boolean
  workshop_registration_start?: string
  workshop_registration_end?: string
  contact_email: string
  checkin_customer_id?: number
  checkin_event_id?: number
  ticket_capacity?: number
  ticket_targets?: SalesTargetConfig
  social_links?: string[]
  organizers: Speaker[]
  featured_speakers?: SpeakerWithTalks[]
  featured_talks?: ProposalExisting[]
  domains: string[]
  formats: Format[]
  topics: Topic[]
  sponsors?: ConferenceSponsor[]
  sponsor_tiers?: SponsorTier[]
  sponsor_benefits?: SponsorBenefit[]
  sponsorship_customization?: SponsorshipCustomization
  ticket_customization?: TicketCustomization
  ticket_inclusions?: TicketInclusion[]
  ticket_faqs?: TicketFaq[]
  schedules?: ConferenceSchedule[]
  vanity_metrics?: ConferenceVanityMetric[]
  features?: string[]
  featuredGalleryImages?: GalleryImageWithSpeakers[]
  galleryImages?: GalleryImageWithSpeakers[]
}
