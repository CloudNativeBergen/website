import { defineField, defineType } from 'sanity'

/**
 * A single persisted in-app notification for one recipient. Notifications are
 * fanned out per-recipient (one document each) rather than shared, so read state
 * (`readAt`) is naturally per-user and queries stay a simple recipient filter.
 *
 * NOTE: distinct from the ephemeral toast system (`NotificationProvider` /
 * `NotificationToast`). This is the durable notification hub.
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
          // Reserved for future use — no emitter yet.
          { title: 'Proposal Comment', value: 'proposal_comment' },
          { title: 'Travel Support Update', value: 'travel_support_update' },
          { title: 'Sponsor Activity', value: 'sponsor_activity' },
          // Reserved for future use — no emitter yet.
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
