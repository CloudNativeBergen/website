/**
 * The persistent in-app notification hub types.
 *
 * NOTE: unrelated to the ephemeral toast system (`NotificationProvider` /
 * `NotificationToast`). This is the durable, per-recipient notification store.
 */

export type NotificationType =
  | 'proposal_submitted'
  | 'proposal_status_changed'
  // Reserved for future use — no emitter yet.
  | 'proposal_comment'
  // Speaker↔organizer conversation message (messaging M1).
  | 'message_received'
  | 'cospeaker_response'
  | 'travel_support_update'
  | 'sponsor_activity'
  // Reserved for future use — no emitter yet.
  | 'schedule_update'
  | 'gallery_tagged'
  | 'system'

/**
 * The write-side shape used to fan a notification out to a single recipient.
 * One of these is produced per recipient; `createNotifications` turns each into
 * one `notification` document in a single transaction.
 */
export interface NotificationInput {
  recipientId: string
  conferenceId: string
  notificationType: NotificationType
  title: string
  message?: string
  /** App-relative deep link, e.g. /cfp/proposal/<id> or /admin/proposals/<id>. */
  link?: string
  /** Speaker whose action triggered this. Omitted for system notifications. */
  actorId?: string
  /** Weakly referenced proposal (talk) id, if the notification relates to one. */
  relatedProposalId?: string
  /**
   * Optional stable push `tag`. When set, successive web pushes carrying the
   * same tag REPLACE each other on the device (the SW passes it to
   * `showNotification`) instead of stacking. Used by the collapsed
   * `message_received` upsert to keep one lock-screen notification per thread,
   * mirroring the single collapsed hub item. Absent for one-shot event types
   * (they intentionally stack).
   */
  tag?: string
}

/**
 * The write-side shape for the COLLAPSED message notification upsert (M5).
 * One of these is produced per recipient of a new message;
 * `upsertMessageNotifications` folds each into the recipient's single
 * per-conversation `notification` document (deterministic id
 * `notification.message.<conversationId>.<recipientId>`) instead of creating a
 * new document per message. The title is derived from the accumulated unread
 * count, so callers pass the raw ingredients (author name + subject) rather
 * than a pre-built title.
 */
export interface MessageNotificationInput {
  recipientId: string
  conversationId: string
  conferenceId: string
  /** Display name of the latest message's author. */
  authorName: string
  /** Conversation subject (proposal threads default this to the talk title). */
  subject: string
  /** Excerpt of the latest message body. */
  message?: string
  /** App-relative deep link to the conversation for THIS recipient's audience. */
  link?: string
  /** Speaker whose message triggered this. */
  actorId?: string
  /** Weakly referenced proposal (talk) id, for proposal threads. */
  relatedProposalId?: string
}

/** The actor sub-object projected for the client. */
export interface NotificationActor {
  _id: string
  name: string
  image?: string
}

/** The read-side shape returned to the client (from `getNotificationsForSpeaker`). */
export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  message?: string
  link?: string
  /** ISO datetime; unset/null means unread. */
  readAt?: string | null
  createdAt: string
  actor?: NotificationActor | null
}
