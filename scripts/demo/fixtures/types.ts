/**
 * Demo fixture contract (#2150).
 *
 * `d1` holds everything that lives in D1 behind the subgraph API and is
 * seeded by website-001's `seedDemoD1(fixtures)`. `sanity` holds Sanity
 * content seeded by the site. Neither seeder writes the other branch.
 *
 * Field names follow their source of truth:
 * - d1.editions: services/conference/migrations/0001,0004,0005,0007 (camelCased)
 * - d1.members/invites: services/identity/migrations/0001 + ORG_ROLES in packages/tenancy
 * - d1.speakerProfiles: services/identity/migrations/0008_speaker_profile.sql
 * - d1.ticketTypes/ticketOrders: PROVISIONAL, mirrors services/ticketing/migrations/0001
 *   from #2157 (ticket_types, ticket_orders, ticket_order_lines); not merged yet
 * - d1.editions.lifecycle: tenant-directory conferences.lifecycle (0005); past/live/upcoming
 *   is derived from the dates, not stored
 * - sanity.*: sanity/schemaTypes/<type>.ts
 *
 * Cross-references use the fixture `key` (stable, seed-derived string), never
 * a store id; each seeder maps keys to its own ids. Timestamps are ISO 8601
 * strings; dates are YYYY-MM-DD. Money is integer minor units + ISO currency.
 */
import type { Format, Level, Status } from '@/lib/proposal/types'
import type { INVITATION_STATUSES } from '@/lib/cospeaker/types'
import type { FEEDBACK_COLOURS } from '@/lib/feedback/colour'

/** Mirrors ORG_ROLES in packages/tenancy/src/authz.ts (not resolvable from the root package). */
export type OrgRole = 'owner' | 'admin' | 'member'

export type Key = string
export type IsoDate = string
export type IsoDateTime = string

export interface Money {
  /** Integer minor units (øre, cents). */
  amount: number
  currency: 'NOK' | 'EUR' | 'USD' | 'SEK' | 'DKK' | 'GBP'
}

export interface FakePerson {
  key: Key
  name: string
  /** Always @example.com or *.test. */
  email: string
  /** Repo asset path, never a real face. */
  image?: string
}

// ---------------------------------------------------------------- D1

/** tenant-directory conferences.lifecycle (0005_lifecycle_cancelled.sql). */
export type Lifecycle = 'draft' | 'live' | 'cancelled' | 'archived'

/** One row of `conferences` (conference subgraph). */
export interface D1Edition {
  key: Key
  lifecycle: Lifecycle
  published: boolean
  visibility: 'live' | 'unlisted'
  title: string
  tagline: string
  city: string
  country: string
  venueName: string
  venueAddress: string
  startDate: IsoDate
  endDate: IsoDate
  // branding
  // logos live in Sanity only (conference 0002_drop_logos.sql): see SanityBranding
  backgroundPattern?: string
  primaryColor: string
  accentColor: string
  registrationLink: string
  /** JSON array of URLs (conference 0001_init.sql social_links). */
  socialLinks: string[]
  // settings phase 1: scalar fields
  cfpStartDate: IsoDate
  cfpEndDate: IsoDate
  cfpNotifyDate: IsoDate
  programDate: IsoDate
  travelSupportPaymentDate?: IsoDate
  earlyBirdEndDate?: IsoDate
  registrationCloseDate?: IsoDate
  speakersAnnouncedDate?: IsoDate
  sponsorDeadlineDate?: IsoDate
  recordingsLiveDate?: IsoDate
  /** Stored as REAL in D1, in major units of the edition currency. */
  travelSupportBudget?: number
  registrationEnabled: boolean
  /** Column organizer_name; Drizzle/mutation property `organizer`. */
  organizer: string
  organizerAddress: string
  organizerOrgNumber: string
  socialHashtag: string
  showVanityMetrics: boolean
  // settings phase 2: links, emails, channels
  sponsorRegistrationLink?: string
  speakerRegistrationLink?: string
  volunteerRegistrationLink?: string
  contactEmail: string
  cfpEmail: string
  sponsorEmail: string
  salesNotificationChannel?: string
  cfpNotificationChannel?: string
  speakerSlackChannel?: string
  // settings phase 3: ticket setup
  ticketingProvider?: 'checkin' | 'tito'
  titoAccountSlug?: string
  titoEventSlug?: string
  ticketCapacity: number
  ticketTargetsEnabled: boolean
  ticketSalesStartDate: IsoDate
  workshopRegistrationStart?: IsoDateTime
  workshopRegistrationEnd?: IsoDateTime
}

/** identity `user` + `member`. Roles from ORG_ROLES. */
export interface D1Member extends FakePerson {
  role: OrgRole
}

/** identity `invitation`. */
export interface D1Invite {
  key: Key
  email: string
  role: OrgRole
  status: 'pending' | 'accepted' | 'rejected' | 'canceled'
  expiresAt: IsoDateTime
  inviterKey: Key
}

/** identity `speaker_profile`; `userKey` points at a FakePerson. */
export interface D1SpeakerProfile {
  userKey: Key
  name: string
  bio: string
  photoKey?: string
  links: string[]
  topics: string[]
  visibility: 'private' | 'network' | 'public'
}

/** PROVISIONAL: ticket_types in #2157 (services/ticketing 0001). */
export interface D1TicketType {
  key: Key
  editionKey: Key
  name: string
  price: Money
  capacity?: number
}

/** PROVISIONAL: ticket_orders + ticket_order_lines in #2157. */
export interface D1TicketOrder {
  key: Key
  editionKey: Key
  status: 'pending' | 'paid' | 'cancelled'
  total: Money
  buyerEmail?: string
  lines: { ticketTypeKey: Key; quantity: number; unitPrice: Money }[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

// ---------------------------------------------------------------- Sanity

/** conference.logoBright/logoDark/logomarkBright/logomarkDark (Sanity only). */
export interface SanityBranding {
  /** Inline SVG markup from scripts/demo/assets (the fields are `inlineSvg`). */
  logoBright: string
  logoDark: string
  logomarkBright: string
  logomarkDark: string
  primaryColor: string
  accentColor: string
}

export interface SanitySpeaker extends FakePerson {
  title: string
  slug: string
  bio: string
  links: string[]
  country?: string
}

export interface SanityProposal {
  key: Key
  editionKey: Key
  title: string
  description: string
  language: 'norwegian' | 'english'
  format: Format
  level: Level
  status: Status
  /** First is the primary speaker. Speaker keys. */
  speakerKeys: Key[]
  topics: string[]
}

export interface SanityReview {
  key: Key
  proposalKey: Key
  reviewerKey: Key
  comment: string
  score: { content: number; relevance: number; speaker: number }
}

export interface SanityCoSpeakerInvitation {
  key: Key
  proposalKey: Key
  invitedByKey: Key
  invitedEmail: string
  invitedName: string
  status: (typeof INVITATION_STATUSES)[number]
  expiresAt: IsoDateTime
  createdAt: IsoDateTime
}

export interface SanityScheduleSlot {
  startTime: string
  endTime: string
  /** Either a proposal or a placeholder ("Lunch", "TBA"). */
  talkKey?: Key
  placeholder?: string
}

export interface SanitySchedule {
  key: Key
  editionKey: Key
  date: IsoDate
  tracks: {
    trackTitle: string
    trackDescription: string
    talks: SanityScheduleSlot[]
  }[]
}

export interface SanitySponsor {
  key: Key
  name: string
  website: string
  /** Inline SVG string (sponsor.logo is `inlineSvg`). */
  logo: string
}

export interface SanitySponsorTier {
  key: Key
  editionKey: Key
  title: string
  tagline: string
  tierType: 'standard' | 'special' | 'addon'
  price: Money
  maxQuantity?: number
}

export interface SanitySponsorForConference {
  key: Key
  editionKey: Key
  sponsorKey: Key
  tierKey: Key
  status:
    'prospect' | 'contacted' | 'negotiating' | 'closed-won' | 'closed-lost'
  contractStatus:
    | 'none'
    | 'verbal-agreement'
    | 'registration-sent'
    | 'contract-sent'
    | 'contract-signed'
  signatureStatus: 'not-started' | 'pending' | 'signed' | 'rejected' | 'expired'
  invoiceStatus: 'not-sent' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  invoiceSentAt?: IsoDateTime
  invoiceDueAt?: IsoDate
  invoicePaidAt?: IsoDateTime
  assignedToKey?: Key
  contactInitiatedAt?: IsoDateTime
}

export interface SanityVolunteer extends FakePerson {
  editionKey: Key
  phone: string
  occupation: 'student' | 'working' | 'unemployed' | 'other'
  tshirtSize: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL'
  status: 'pending' | 'approved' | 'confirmed' | 'rejected'
  submittedAt: IsoDateTime
}

export interface SanityWorkshopSignup {
  key: Key
  workshopKey: Key
  user: FakePerson
  experienceLevel: 'beginner' | 'intermediate' | 'advanced'
  operatingSystem: 'windows' | 'macos' | 'linux'
  status: 'confirmed' | 'waitlist'
  signedUpAt: IsoDateTime
}

export interface SanityTravelSupport {
  key: Key
  editionKey: Key
  speakerKey: Key
  status: 'draft' | 'submitted' | 'approved' | 'paid' | 'rejected'
  totalAmount: Money
  approvedAmount?: Money
  submittedAt?: IsoDateTime
}

export interface SanityFeedback {
  key: Key
  talkKey: Key
  colour: (typeof FEEDBACK_COLOURS)[number]
  comment?: string
  submittedAt: IsoDateTime
}

export interface SanityConversation {
  key: Key
  editionKey: Key
  conversationType: 'proposal' | 'general' | 'sponsor'
  proposalKey?: Key
  sponsorForConferenceKey?: Key
  messages: {
    authorKey?: Key
    authorName: string
    body: string
    origin: 'person' | 'system'
    createdAt: IsoDateTime
  }[]
}

export interface SanityNotification {
  key: Key
  recipientKey: Key
  editionKey: Key
  notificationType:
    | 'proposal_submitted'
    | 'proposal_status_changed'
    | 'message_received'
    | 'cospeaker_response'
    | 'travel_support_update'
    | 'sponsor_activity'
  title: string
  message: string
  link: string
  readAt?: IsoDateTime
  createdAt: IsoDateTime
}

export interface DemoFixtures {
  seed: number
  now: IsoDateTime
  d1: {
    editions: D1Edition[]
    members: D1Member[]
    invites: D1Invite[]
    speakerProfiles: D1SpeakerProfile[]
    ticketTypes: D1TicketType[]
    ticketOrders: D1TicketOrder[]
  }
  sanity: {
    branding: SanityBranding
    speakers: SanitySpeaker[]
    proposals: SanityProposal[]
    reviews: SanityReview[]
    coSpeakerInvitations: SanityCoSpeakerInvitation[]
    schedules: SanitySchedule[]
    sponsors: SanitySponsor[]
    sponsorTiers: SanitySponsorTier[]
    sponsorsForConference: SanitySponsorForConference[]
    volunteers: SanityVolunteer[]
    workshopSignups: SanityWorkshopSignup[]
    travelSupport: SanityTravelSupport[]
    feedback: SanityFeedback[]
    conversations: SanityConversation[]
    notifications: SanityNotification[]
  }
}
