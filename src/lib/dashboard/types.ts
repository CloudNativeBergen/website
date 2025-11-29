import type { Conference } from '@/lib/conference/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import type { WorkshopStats } from '@/components/cfp/WorkshopStatistics'
import type { TravelSupportWithExpenses } from '@/lib/travel-support/types'
import type { BadgeRecord } from '@/lib/badge/types'

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

export interface Widget<TConfig = Record<string, unknown>> {
  id: string
  type: string
  position: GridPosition
  title: string
  config?: TConfig
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
