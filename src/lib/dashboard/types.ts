import type { ThankYouTalk } from '@/lib/speaker/dashboardBriefing'
import type { Conference } from '@/lib/conference/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import type { WorkshopStats } from '@/components/cfp/WorkshopStatistics'
import type { TravelSupportWithExpenses } from '@/lib/travel-support/types'
import type { BadgeRecord } from '@/lib/badge/types'
import type { SpeakerTalkPhotos } from '@/lib/photo-wall/wall'
import type { FeedbackChips } from '@/lib/feedback/chips'
import type { WidgetMetadata } from './widget-metadata'
import type { ConferencePhase } from '@/lib/conference/phase'
import type { SpeakerBriefing } from '@/lib/speaker/briefing'
import { z } from 'zod'

/**
 * Standard props that all widgets should implement
 */
export interface BaseWidgetProps<TConfig = Record<string, unknown>> {
  /** The conference context for the widget */
  conference?: Conference
  /** Configuration for the widget */
  config?: TConfig
  /** Optional class name for styling */
  className?: string
}

/**
 * The conference fields the speaker dashboard (`/cfp/list`) reads, server and
 * client side (#980, #1795). `CompactConferenceCard` and
 * `ProposalConfirmationHandler` are client components, so everything here is
 * serialized into the page: keep it to what they render.
 */
export const CFP_DASHBOARD_CONFERENCE_FIELDS = [
  '_id',
  'title',
  // A reference, read server side by the briefing's organizer check.
  'organization',
  'city',
  'country',
  'venueName',
  'venueAddress',
  'startDate',
  'endDate',
  'cfpStartDate',
  'cfpEndDate',
  'cfpNotifyDate',
  'cfpEmail',
  'contactEmail',
  'domains',
  'socialHashtag',
  'socialLinks',
] as const satisfies readonly (keyof Conference)[]

export type CfpDashboardConference = Pick<
  Conference,
  (typeof CFP_DASHBOARD_CONFERENCE_FIELDS)[number]
>

export interface ConferenceWithSpeakerData {
  conference: CfpDashboardConference
  proposals: ProposalExisting[]
  galleryImages: GalleryImageWithSpeakers[]
  workshopStats: WorkshopStats[]
  travelSupport: TravelSupportWithExpenses | null
  badges: BadgeRecord[]
  isOver: boolean
  canEditProposals: boolean
  /** The proposals read failed, so `proposals` may be incomplete (#848). */
  proposalsFailed?: boolean
  /** Photos of your talks (talk photos spec §7.3): own talks, with photos only. */
  talkPhotos?: SpeakerTalkPhotos[]
  /** Session Feedback chip per confirmed talk (speaker feedback spec §9.4). */
  feedbackChips?: FeedbackChips
  /**
   * Where a chip's Session Feedback section opens: `''` for this host's
   * edition, the edition's own origin otherwise, `null` for none.
   */
  feedbackLinkOrigin?: string | null
  /**
   * The speaker briefing (#1592), only for the current domain's edition while
   * the speaker has a confirmed talk and the conference is not over.
   */
  briefing?: SpeakerBriefing
  /** The Oslo date when today is one of the conference's days. */
  conferenceDay?: string
  /** Pin the dinner: from the start of its day until it begins. */
  pinDinner?: boolean
  /** The dinner route, checked against the current routes; `null` = unanswered. */
  dinnerChoice?: string | null
  /** The briefing is shown because the speaker organizes the edition. */
  asOrganizer?: boolean
  /** Today is the day before the conference. */
  dayBefore?: boolean
  /** When the speaker ticket was emailed. */
  ticketSentAt?: string
  /** After the event, for a while: the confirmed talks to thank for. */
  thankYou?: ThankYouTalk[]
}

export interface GridPosition {
  row: number
  col: number
  rowSpan: number
  colSpan: number
}

/**
 * Configuration for phase-aware widget behavior
 */
export interface PhaseConfig {
  /** Phases where this widget is most relevant */
  relevantPhases: ConferencePhase[]
  /** Whether widget should be hidden in irrelevant phases */
  hideInIrrelevantPhases?: boolean
  /** Whether widget adapts its display based on phase */
  isPhaseAdaptive?: boolean
  /** Optional phase-specific titles */
  phaseTitles?: Partial<Record<ConferencePhase, string>>
}

/**
 * Supported widget configuration field types
 */
export type WidgetConfigFieldType = 'number' | 'boolean' | 'select' | 'text'

/**
 * Base configuration field definition
 */
export interface WidgetConfigFieldBase<T = unknown> {
  /** Field type for rendering appropriate input */
  type: WidgetConfigFieldType
  /** Display label for the field */
  label: string
  /** Help text or description */
  description?: string
  /** Default value for the field */
  defaultValue: T
  /** Zod schema for validation */
  schema: z.ZodType<T>
}

/**
 * Number field configuration
 */
export interface NumberFieldConfig extends WidgetConfigFieldBase<number> {
  type: 'number'
  min?: number
  max?: number
  step?: number
  /** Unit to display (e.g., 'submissions', '%', 'days') */
  unit?: string
}

/**
 * Boolean field configuration
 */
export interface BooleanFieldConfig extends WidgetConfigFieldBase<boolean> {
  type: 'boolean'
}

/**
 * Select field configuration
 */
export interface SelectFieldConfig<
  T = string,
> extends WidgetConfigFieldBase<T> {
  type: 'select'
  /** Available options */
  options: Array<{ value: T; label: string }>
}

/**
 * Text field configuration
 */
export interface TextFieldConfig extends WidgetConfigFieldBase<string> {
  type: 'text'
  placeholder?: string
  maxLength?: number
}

/**
 * Union of all field config types
 */
export type WidgetConfigField =
  NumberFieldConfig | BooleanFieldConfig | SelectFieldConfig | TextFieldConfig

/**
 * Widget configuration schema definition
 * Defines the structure and validation for widget configuration
 */
export interface WidgetConfigSchema {
  /** Map of field keys to their configuration */
  fields: Record<string, WidgetConfigField>
  /** Combined Zod schema for the entire config object */
  schema: z.ZodObject<Record<string, z.ZodType>>
}

export interface Widget<TConfig = Record<string, unknown>> {
  id: string
  type: string
  position: GridPosition
  title: string
  config?: TConfig
  /** Optional metadata reference (populated from registry) */
  metadata?: WidgetMetadata
  /** Optional phase configuration for conditional rendering */
  phaseConfig?: PhaseConfig
}

export interface GridConfig {
  cellSize: number
  gap: number
  breakpoints: {
    desktop: { minWidth: number; cols: number }
    tablet: { minWidth: number; cols: number }
    mobile: { minWidth: number; cols: number }
  }
}
