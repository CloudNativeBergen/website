import { Conference } from '@/lib/conference/types'
import { Speaker } from '@/lib/speaker/types'
import { ProposalExisting, Action, Status } from '@/lib/proposal/types'
import { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import type { ContractStatus, SponsorStatus } from '@/lib/sponsor-crm/types'

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
    /**
     * The cancel/withdraw message was posted to the proposal thread and fanned
     * out (notifyNewMessage), so it already reached the organizers' hub. For a
     * speaker's own withdrawal it also replaces the organizer Slack alert.
     */
    postedToThread?: boolean
    /**
     * Speakers whose ticket an organizer asked to cancel on cancel/withdraw.
     * There is no provider API for it, so organizers are told on Slack to do
     * it by hand. Speakers with another confirmed talk are already left out.
     */
    ticketCancellation?: {
      speakers: { name: string; email?: string }[]
      /** The other-confirmed-talk check failed; organizers must check by hand. */
      unfiltered: boolean
    }
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
 * Fired when a sponsor record's pipeline `status` or `contractStatus` changes
 * on any path that can move it into `closed-won` or `contract-signed` (the
 * CRM procedures, bulk updates, e-signing). Ids only: the Marketing Plan
 * Trigger reads the sponsor itself, so a stale payload never dates a Task.
 */
export interface SponsorStatusPair {
  status: SponsorStatus | null
  contractStatus: ContractStatus | null
}

export interface SponsorStatusChangeEvent {
  eventType: 'sponsor.status.changed'
  timestamp: Date
  conferenceId: string
  sponsorForConferenceId: string
  previous: SponsorStatusPair
  next: SponsorStatusPair
  metadata: {
    /** Which write path changed it, for logs. */
    source: string
    /** The organizer who changed it; absent for a sponsor signing. */
    triggeredBy?: string
    /**
     * One of many records changed at once: a handler that builds work must
     * leave it to the cron rather than do it per record in the request.
     */
    deferred?: boolean
  }
}

/**
 * Fired when ticket types with no workshop decision are met (workshop tickets
 * spec §8): tickets of them were sold, or their holder was refused at the
 * portal. Raised through `reportNotSetTicketTypes`
 * (`@/lib/workshop/not-set-notice`), which decides "not set" by the rule,
 * skips a type this process has already raised and bounds how many one call
 * may carry. ONE event per call, so the handler reads the organizers once and
 * writes once however many types it names. Ids and type names only.
 */
export interface WorkshopTicketTypeNotSetEvent {
  eventType: 'workshop.ticket-type.not-set'
  timestamp: Date
  conferenceId: string
  /** The provider's own names for the types, as they appeared on the tickets. */
  typeNames: string[]
  metadata: {
    /** Which call site met it, for logs. */
    source: 'ticket-sold' | 'portal-refusal'
  }
}

export type WorkshopCapacityThreshold = 'eighty-percent' | 'waitlist'

/**
 * Fired when a write to a workshop's seats crosses a threshold: confirmed
 * seats reach 80% of capacity, or the first sign-up is waitlisted. Raised
 * through `reportCapacityThresholds` (`@/lib/workshop/capacity-notice`).
 * Counts only, nothing about the attendees.
 */
export interface WorkshopCapacityThresholdEvent {
  eventType: 'workshop.capacity.threshold'
  timestamp: Date
  conferenceId: string
  workshopId: string
  workshopTitle: string
  threshold: WorkshopCapacityThreshold
  /** As the write left them. */
  seatsTaken: number
  capacity: number
}

/**
 * Map of event types to their corresponding event interfaces
 * This provides type-safe event handling throughout the application
 */
export interface EventTypeMap {
  'proposal.status.changed': ProposalStatusChangeEvent
  'gallery.speaker.tagged': GallerySpeakerTaggedEvent
  'sponsor.status.changed': SponsorStatusChangeEvent
  'workshop.ticket-type.not-set': WorkshopTicketTypeNotSetEvent
  'workshop.capacity.threshold': WorkshopCapacityThresholdEvent
}

/**
 * Union type of all possible events
 */
export type DomainEvent = EventTypeMap[keyof EventTypeMap]
