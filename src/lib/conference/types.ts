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
  conference?: { _id: string }
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
  heroHeadline?: string
  heroSubheadline?: string
  packageSectionTitle?: string
  addonSectionTitle?: string
  philosophyTitle?: string
  philosophyDescription?: string
  closingQuote?: string
  closingCtaText?: string
  prospectusUrl?: string
}

export interface TicketCustomization {
  heroHeadline?: string
  heroSubheadline?: string
  showVanityMetrics?: boolean
  groupDiscountInfo?: string
  ctaButtonText?: string
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
  organizerOrgNumber?: string
  organizerAddress?: string
  city: string
  country: string
  venueName?: string
  venueAddress?: string
  tagline?: string
  description?: string
  logoBright?: string
  logoDark?: string
  logomarkBright?: string
  logomarkDark?: string
  announcement?: TypedObject[]
  startDate: string
  endDate: string
  cfpStartDate: string
  cfpEndDate: string
  cfpNotifyDate: string
  cfpEmail: string
  sponsorEmail: string
  programDate: string
  registrationLink?: string
  registrationEnabled: boolean
  workshopRegistrationStart?: string
  workshopRegistrationEnd?: string
  contactEmail: string
  checkinCustomerId?: number
  checkinEventId?: number
  ticketCapacity?: number
  ticketTargets?: SalesTargetConfig
  travelSupportBudget?: number
  cfpSubmissionGoal?: number
  cfpLightningGoal?: number
  cfpPresentationGoal?: number
  cfpWorkshopGoal?: number
  signingProvider?: 'self-hosted' | 'adobe-sign'
  sponsorRevenueGoal?: number
  salesNotificationChannel?: string
  cfpNotificationChannel?: string
  socialLinks?: string[]
  organizers: Speaker[]
  featuredSpeakers?: SpeakerWithTalks[]
  featuredTalks?: ProposalExisting[]
  domains: string[]
  formats: Format[]
  topics: Topic[]
  sponsors?: ConferenceSponsor[]
  sponsorTiers?: SponsorTier[]
  sponsorBenefits?: SponsorBenefit[]
  sponsorshipCustomization?: SponsorshipCustomization
  ticketCustomization?: TicketCustomization
  ticketInclusions?: TicketInclusion[]
  ticketFaqs?: TicketFaq[]
  schedules?: ConferenceSchedule[]
  vanityMetrics?: ConferenceVanityMetric[]
  features?: string[]
  featuredGalleryImages?: GalleryImageWithSpeakers[]
  galleryImages?: GalleryImageWithSpeakers[]
}
