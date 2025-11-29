import type { Conference } from '@/lib/conference/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import type { WorkshopStats } from '@/components/cfp/WorkshopStatistics'
import type { TravelSupportWithExpenses } from '@/lib/travel-support/types'
import type { BadgeRecord } from '@/lib/badge/types'
import type { WidgetMetadata } from './widget-metadata'
import type { ConferencePhase } from '@/lib/conference/phase'

export interface ConferenceWithSpeakerData {
  conference: Conference
  proposals: ProposalExisting[]
  galleryImages: GalleryImageWithSpeakers[]
  workshopStats: WorkshopStats[]
  travelSupport: TravelSupportWithExpenses | null
  badges: BadgeRecord[]
  isOver: boolean
  canEditProposals: boolean
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
