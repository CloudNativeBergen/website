import { defineField, defineType } from 'sanity'

/**
 * A single persisted in-app notification for one recipient. Notifications are
 * fanned out per-recipient (one document each) rather than shared, so read state
 * (`readAt`) is naturally per-user and queries stay a simple recipient filter.
 *
 * NOTE: distinct from the ephemeral toast system (`NotificationProvider` /
 * `NotificationToast`). This is the durable notification hub.
 *
 * COLLAPSE MODEL (message_received, M5): instead of one document per message,
 * the hub keeps ONE persistent document per (recipient, conversation) with a
 * deterministic id (`notification.message.<conversationId>.<recipientId>`).
 * Every new message re-surfaces that document: `createdAt` is bumped, `readAt`
 * is unset, and `count` tracks how many unread messages it represents (unread
 * accumulates; a read document resets to 1). Other notification types remain
 * one-document-per-event.
 */
export default defineType({
  name: 'notification',
  title: 'Notification',
  type: 'document',
  fields: [
    defineField({
      name: 'recipient',
      title: 'Recipient',
      type: 'reference',
      to: [{ type: 'speaker' }],
      // Weak so erasing a speaker (GDPR) doesn't orphan-block their deletion;
      // retention prunes notifications anyway, so a dangling recipient ref on a
      // not-yet-purged doc is tolerated.
      weak: true,
      description: 'The speaker who receives this notification.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      description: 'The conference edition this notification belongs to.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'notificationType',
      title: 'Type',
      type: 'string',
      options: {
        list: [
          { title: 'Proposal Submitted', value: 'proposal_submitted' },
          {
            title: 'Proposal Status Changed',
            value: 'proposal_status_changed',
          },
          // Reserved, currently unused — superseded by 'message_received'
          // (decision comments relay via the message thread). No emitter.
          { title: 'Proposal Comment', value: 'proposal_comment' },
          { title: 'Message Received', value: 'message_received' },
          { title: 'Stale Conversation', value: 'message_stale' },
          { title: 'Conversation Assigned', value: 'conversation_assigned' },
          { title: 'Co-Speaker Response', value: 'cospeaker_response' },
          { title: 'Travel Support Update', value: 'travel_support_update' },
          { title: 'Sponsor Activity', value: 'sponsor_activity' },
          // Emitted by src/lib/reminders/schedule-alerts.ts when a talk's slot
          // moves (date/time/track position) on a schedule save.
          { title: 'Schedule Update', value: 'schedule_update' },
          { title: 'Gallery Tagged', value: 'gallery_tagged' },
          { title: 'System', value: 'system' },
        ],
        layout: 'dropdown',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required().max(200),
    }),
    defineField({
      name: 'message',
      title: 'Message',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'link',
      title: 'Link',
      type: 'string',
      description:
        'App-relative deep link, e.g. /cfp/proposal/<id> or /admin/proposals/<id>.',
    }),
    defineField({
      name: 'actor',
      title: 'Actor',
      type: 'reference',
      to: [{ type: 'speaker' }],
      // Weak so erasing a speaker (GDPR) doesn't orphan-block their deletion.
      weak: true,
      description:
        'The speaker whose action triggered this notification. Omitted for system-generated notifications.',
    }),
    defineField({
      name: 'relatedProposal',
      title: 'Related Proposal',
      type: 'reference',
      to: [{ type: 'talk' }],
      // Weak so deleting the proposal does not orphan-block or fail the delete;
      // the notification simply ends up with a dangling reference.
      weak: true,
    }),
    defineField({
      name: 'count',
      title: 'Count',
      type: 'number',
      description:
        'How many unread messages this collapsed notification represents; absent = 1. Only used by the message_received collapse model.',
      validation: (Rule) => Rule.min(1).integer(),
    }),
    defineField({
      name: 'readAt',
      title: 'Read At',
      type: 'datetime',
      description: 'When the recipient read this notification. Unset = unread.',
    }),
    defineField({
      name: 'createdAt',
      title: 'Created At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
      initialValue: () => new Date().toISOString(),
    }),
  ],
  preview: {
    select: {
      title: 'title',
      recipient: 'recipient.name',
      createdAt: 'createdAt',
    },
    prepare({ title, recipient, createdAt }) {
      const when = createdAt
        ? new Date(createdAt).toLocaleDateString()
        : 'Unknown date'
      return {
        title: title || 'Notification',
        subtitle: `To ${recipient || 'Unknown'} on ${when}`,
      }
    },
  },
  orderings: [
    {
      title: 'Created Date (Newest first)',
      name: 'createdAtDesc',
      by: [{ field: 'createdAt', direction: 'desc' }],
    },
    {
      title: 'Created Date (Oldest first)',
      name: 'createdAtAsc',
      by: [{ field: 'createdAt', direction: 'asc' }],
    },
  ],
})
