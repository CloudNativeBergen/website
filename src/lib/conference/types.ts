import { TypedObject } from 'sanity'
import { Format, ProposalExisting } from '@/lib/proposal/types'
import { Speaker, SpeakerWithTalks } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import { ScheduleStatus } from '@/lib/schedule/types'
import { SponsorTier, ConferenceSponsor } from '@/lib/sponsor/types'
import type { SalesTargetConfig } from '@/lib/tickets/types'
import { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import type { OrganizerTeam } from '@/lib/teams/types'
import type { ConferenceVisibility } from './visibility'
import type { BackgroundPattern } from './backgroundPattern'
import type { HomepageSection } from '@/lib/homepage/sections'
import type { LifecycleStatus } from '@/lib/homepage/lifecycle'

export interface CrmActivityThreshold {
  _key?: string
  stateType: string
  stateValue: string
  days: number
}

export interface TrackTalk {
  talk?: ProposalExisting
  placeholder?: string
  startTime: string
  endTime: string
  /**
   * True when the persisted slot HAD a `talk` reference, regardless of whether
   * that reference still resolves. Lets renderers tell a genuine service
   * session (no ref + placeholder) apart from a dangling reference whose
   * proposal was deleted (`hasTalkRef` true but `talk` unresolved), so the
   * latter is not mislabelled as a "Service Session".
   */
  hasTalkRef?: boolean
}
export interface ScheduleTrack {
  trackTitle: string
  trackDescription: string
  talks: Array<TrackTalk>
}
export interface ConferenceSchedule {
  _id: string
  /**
   * Sanity document revision, threaded through load→edit→save for optimistic
   * concurrency: the SAVE patches with `ifRevisionId` so a stale write (another
   * organizer edited the same day since it was loaded) is rejected instead of
   * silently clobbering their changes. Absent for a not-yet-persisted day.
   */
  _rev?: string
  date: string
  tracks: Array<ScheduleTrack>
  conference?: { _id: string }
  status?: ScheduleStatus
  version?: number
  owner?: { _ref: string; _type: 'reference' }
}

export interface ConferenceVanityMetric {
  label: string
  value: string
}

export interface SponsorBenefit {
  _key?: string
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

export interface AgentConfiguration {
  conferenceContext?: string
  proposalReviewConfig?: string
  sponsorCrmConfig?: string
}

export interface Conference {
  _id: string
  title: string
  /**
   * Discovery visibility (M0 trial groundwork). `'unlisted'` excludes this
   * conference from sitemaps/robots/search indexing while keeping it reachable
   * by direct link; `'live'` is publicly listed and indexed. OPTIONAL because
   * legacy documents carry no field — server code treats ABSENT as `'live'`
   * (see `@/lib/conference/visibility`). Projected by the main conference
   * projection's `...` spread.
   */
  visibility?: ConferenceVisibility
  /**
   * Multi-tenant anchor (CaaS T1-1, #613): the organization (tenant) that owns
   * this conference edition. Projected as a raw reference by the main conference
   * projection (`...` spread). OPTIONAL on the type because legacy documents lack
   * it until the 044 backfill runs — downstream code must not assume presence.
   */
  organization?: { _ref: string; _type?: 'reference' }
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
  /**
   * Decorative page background (go-live gate G2, #643). ABSENT is treated as
   * `'cloud-native'` — the animated CNCF ecosystem logos — so legacy documents
   * are unaffected. `'subtle'` renders the same pattern far sparser/fainter;
   * `'none'` renders a plain gradient with no logos. Projected by the main
   * conference projection's `...` spread.
   */
  backgroundPattern?: BackgroundPattern
  /**
   * Per-tenant brand theme (THEMING L1). Optional design-token override for the
   * primary interactive colour and the gradient accent; ABSENT renders the house
   * palette pixel-identical. Resolved into CSS custom properties by `ThemeStyle`
   * / `conferenceThemeCss`. Projected by the main conference projection's `...`
   * spread. See `@/lib/branding/theme`.
   */
  theme?: {
    primaryColor?: string
    accentColor?: string
  }
  /**
   * This tenant's OWN Pirsch (pirsch.io) identification code. ABSENT means no
   * analytics script is served on this conference's pages at all — there is no
   * platform-level fallback, because the only other default would be collecting
   * this tenant's traffic into a property they do not own. Projected by the main
   * conference projection's `...` spread. See `resolvePirschCode`.
   */
  analyticsPirschCode?: string
  announcement?: TypedObject[]
  /**
   * Place-specific /info FAQ prose. Each is optional and ABSENT means the
   * corresponding question is NOT rendered — these replaced hardcoded Bergen
   * geography that was interpolated with whatever city a tenant configured, so
   * omitting the answer is the only safe default.
   */
  venueTravelInfo?: string
  speakerDinnerInfo?: string
  localRecommendations?: string
  /**
   * Event hashtag for the live social wall (`/stream`). ABSENT means no hashtag
   * search is performed at all — the wall never falls back to another event's
   * tag.
   */
  socialHashtag?: string
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
  /**
   * Ticketing vendor selector. ABSENT ⇒ 'checkin' (every legacy conference);
   * 'tito' routes to the Tito account/event slugs below. Server code must treat
   * absence as Checkin — see `conferenceProviderType`.
   */
  ticketingProvider?: 'checkin' | 'tito'
  checkinCustomerId?: number
  checkinEventId?: number
  /** Tito account slug (e.g. "ultimateconf" in ti.to/ultimateconf/2026). */
  titoAccountSlug?: string
  /** Tito event slug (e.g. "2026" in ti.to/ultimateconf/2026). */
  titoEventSlug?: string
  ticketCapacity?: number
  ticketTargets?: SalesTargetConfig
  travelSupportPaymentDate?: string
  travelSupportBudget?: number
  cfpSubmissionGoal?: number
  cfpLightningGoal?: number
  cfpPresentationGoal?: number
  cfpWorkshopGoal?: number
  /**
   * Contract signing provider. Self-hosted is the only supported value;
   * legacy documents may still carry a removed value (e.g. 'adobe-sign'),
   * which the signing-provider factory tolerates and falls back from.
   */
  signingProvider?: 'self-hosted'
  sponsorRevenueGoal?: number
  salesNotificationChannel?: string
  cfpNotificationChannel?: string
  socialLinks?: string[]
  /**
   * Optional organizer sub-teams — a SOFT routing lens, never access control.
   * Absent = today’s behaviour (all organizers receive everything). `members`
   * are speaker `_id`s when fetched via the normalized conference projection or
   * {@link import('@/lib/teams').getConferenceTeams}. See docs/ORGANIZER_TEAMS.md.
   */
  teams?: OrganizerTeam[]
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
  agentConfig?: AgentConfiguration
  featuredGalleryImages?: GalleryImageWithSpeakers[]
  galleryImages?: GalleryImageWithSpeakers[]
  crmInactivityThresholds?: CrmActivityThreshold[]
  /**
   * Front-page builder (F1/F2) composition. ABSENT (every legacy conference)
   * renders the phase-aware default layout — see `@/lib/homepage/sections`
   * (`resolveHomepageSections`). Projected raw by the main conference projection's
   * `...` spread; sections carry only their own presentation config.
   */
  homepageSections?: HomepageSection[]
  /**
   * Homepage lifecycle OVERRIDE (F5). ABSENT (every legacy conference) means the
   * stage is derived from the CFP / programme / event dates — see
   * `@/lib/homepage/lifecycle`. The two values here are the only states no date
   * can imply: an event is `cancelled` or `archived` because a human says so.
   * Both REPLACE the homepage rather than adding a banner to it. Projected by
   * the main conference projection's `...` spread.
   */
  lifecycleStatus?: LifecycleStatus
  /** Headline for the cancelled/archived notice. Blank → a derived default. */
  lifecycleHeadline?: string
  /** Body copy for the cancelled/archived notice. Plain text, newline-aware. */
  lifecycleMessage?: string
  /** Label for the single link on the notice (e.g. "Read the full statement"). */
  lifecycleLinkLabel?: string
  /** Destination for the notice link. Same safe-link rules as hero CTAs. */
  lifecycleLinkHref?: string
}
