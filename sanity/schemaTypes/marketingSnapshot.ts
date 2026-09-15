import { defineArrayMember, defineField, defineType } from 'sanity'

const count = (name: string, title: string) =>
  defineField({
    name,
    title,
    description: 'null when the source was unavailable, never 0.',
    type: 'number',
  })

/**
 * One stored daily reading of a Campaign's Outcome and secondary numbers
 * (spec §2.4): one document per Campaign per day, written by the snapshot
 * cron. Missing counts are stored as `null`, never `0`. Schema only in this
 * slice; the cron lands with measurement.
 */
export default defineType({
  name: 'marketingSnapshot',
  title: 'Marketing Snapshot',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({
      name: 'campaign',
      title: 'Campaign',
      type: 'reference',
      to: [{ type: 'marketingCampaign' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) =>
        Rule.required().error('Conference reference is required'),
    }),
    defineField({
      name: 'date',
      title: 'Date',
      description: 'The day the reading covers.',
      type: 'date',
      validation: (Rule) => Rule.required(),
    }),
    count('primaryOutcomeValue', 'Primary Outcome value'),
    defineField({
      name: 'secondary',
      title: 'Secondary',
      type: 'object',
      fields: [
        count('attributedSessions', 'Attributed sessions'),
        count('checkoutClickThrough', 'Checkout click-through'),
        count('blueskyInteractions', 'Bluesky interactions'),
      ],
    }),
    defineField({
      name: 'perTask',
      title: 'Per Task',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'marketingSnapshotTask',
          fields: [
            defineField({
              name: 'task',
              title: 'Task',
              type: 'reference',
              to: [{ type: 'marketingTask' }],
              weak: true,
            }),
            count('sessions', 'Sessions'),
            count('clicks', 'Clicks'),
            count('blueskyLikes', 'Bluesky likes'),
            count('blueskyReposts', 'Bluesky reposts'),
            count('blueskyReplies', 'Bluesky replies'),
            count('blueskyQuotes', 'Bluesky quotes'),
          ],
        }),
      ],
    }),
    defineField({
      name: 'source',
      title: 'Source status',
      type: 'object',
      fields: [
        defineField({
          name: 'posthog',
          title: 'PostHog',
          type: 'string',
          options: { list: ['ok', 'unavailable'] },
        }),
        defineField({
          name: 'bluesky',
          title: 'Bluesky',
          type: 'string',
          options: { list: ['ok', 'unavailable'] },
        }),
      ],
    }),
    defineField({
      name: 'takenAt',
      title: 'Taken at',
      type: 'datetime',
    }),
  ],
  preview: {
    select: { campaign: 'campaign.title', date: 'date' },
    prepare({ campaign, date }) {
      return { title: `${campaign ?? '?'} · ${date ?? ''}` }
    },
  },
})
