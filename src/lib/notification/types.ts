/**
 * The persistent in-app notification hub types.
 *
 * NOTE: unrelated to the ephemeral toast system (`NotificationProvider` /
 * `NotificationToast`). This is the durable, per-recipient notification store.
 */

export type NotificationType =
  | 'proposal_submitted'
  | 'proposal_status_changed'
  | 'proposal_comment'
  | 'cospeaker_response'
  | 'travel_support_update'
  | 'sponsor_activity'
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
