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
    // Mandatory free-text reason captured on withdrawal (#212).
    reason?: string
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
 * Event fired when someone is invited to co-present a proposal (issue #444).
 *
 * The co-speaker invitation flow bypasses the proposal-status bus and emails the
 * invitee directly (see `src/lib/cospeaker/server.ts`). This event runs IN
 * ADDITION to that email so the push handler can notify the invitee — but ONLY
 * when they already have a speaker account with a push subscription. An invitee
 * without an account simply gets no push (the email still reaches them).
 *
 * The payload carries only the invitee's email (to resolve their account) plus
 * public-to-them context (who invited them, the proposal title); it never
 * carries the invitation bearer token.
 */
export interface CoSpeakerInvitedEvent {
  eventType: 'cospeaker.invited'
  timestamp: Date
  /** The email the invitation was sent to (used to resolve a speaker account). */
  invitedEmail: string
  invitedName?: string
  proposal: {
    _id: string
    title: string
  }
  invitedBy: {
    name: string
    email: string
  }
  conference: Conference
  metadata: {
    domain: string
  }
}

/**
 * Map of event types to their corresponding event interfaces
 * This provides type-safe event handling throughout the application
 */
export interface EventTypeMap {
  'proposal.status.changed': ProposalStatusChangeEvent
  'gallery.speaker.tagged': GallerySpeakerTaggedEvent
  'cospeaker.invited': CoSpeakerInvitedEvent
}

/**
 * Union type of all possible events
 */
export type DomainEvent = EventTypeMap[keyof EventTypeMap]
