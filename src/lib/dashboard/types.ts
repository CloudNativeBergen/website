import type { Conference } from '@/lib/conference/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import type { WorkshopStats } from '@/components/cfp/WorkshopStatistics'

/**
 * Conference with proposals and gallery images for a speaker
 */
export interface ConferenceWithSpeakerData {
  conference: Conference
  proposals: ProposalExisting[]
  galleryImages: GalleryImageWithSpeakers[]
  workshopStats: WorkshopStats[]
  isOver: boolean
  canEditProposals: boolean
}
