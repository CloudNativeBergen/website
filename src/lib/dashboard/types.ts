import type { Conference } from '@/lib/conference/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import type { WorkshopStats } from '@/components/cfp/WorkshopStatistics'
import type { TravelSupportWithExpenses } from '@/lib/travel-support/types'
import type { BadgeRecord } from '@/lib/badge/types'

/**
 * Conference with proposals and gallery images for a speaker
 */
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
