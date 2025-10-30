import { Conference } from '@/lib/conference/types'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting, Action, Status } from '@/lib/proposal/types'
import { GalleryImageWithSpeakers } from '@/lib/gallery/types'

export interface ProposalStatusChangeEvent {
  eventType: 'proposal.status.changed'
  timestamp: Date
  proposal: ProposalExisting
  previousStatus: Status
  newStatus: Status
  action: Action
  conference: Conference
  speakers: Speaker[]
  metadata: {
    triggeredBy: {
      speakerId: string
      isOrganizer: boolean
    }
    shouldNotify?: boolean
    comment?: string
    domain: string
  }
}

/**
 * Event fired when speakers are tagged in a gallery image.
 *
 * PAYLOAD SIZE CONSIDERATIONS:
 * Currently, this event includes the full image and speaker objects to avoid
 * additional database queries in handlers. This design trades memory/network
 * overhead for reduced database load and simpler handler logic.
 *
 * ALTERNATIVE APPROACH:
 * For high-volume scenarios or when payload size becomes a concern, consider
 * refactoring to include only IDs and minimal metadata:
 * - imageId: string
 * - speakerIds: string[]
 * - conferenceId: string
 *
 * Handlers would then fetch full details as needed, trading reduced payload
 * size for increased database queries. This approach would be more suitable
 * for distributed event systems or when events are persisted/queued.
 */
export interface GallerySpeakerTaggedEvent {
  eventType: 'gallery.speaker.tagged'
  timestamp: Date
  image: GalleryImageWithSpeakers
  conference: Conference
  speakers: Speaker[]
  metadata: {
    domain: string
    taggedBy?: string
  }
}

/**
 * Map of event types to their corresponding event interfaces
 * This provides type-safe event handling throughout the application
 */
export interface EventTypeMap {
  'proposal.status.changed': ProposalStatusChangeEvent
  'gallery.speaker.tagged': GallerySpeakerTaggedEvent
}

/**
 * Union type of all possible events
 */
export type DomainEvent = EventTypeMap[keyof EventTypeMap]
