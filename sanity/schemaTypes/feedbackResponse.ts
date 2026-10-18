import { defineField, defineType } from 'sanity'

/**
 * A Feedback Response (speaker feedback spec §4.1): one anonymous attendee's
 * answer about a session. The id is derived from the device's cookie token and
 * the talk (`feedbackResponse-<hash>`, `src/lib/feedback/device.ts`), so a
 * second tap from the same phone changes the answer. Written only by the
 * server; nothing that identifies the attendee is stored.
 *
 * The talk reference is STRONG: deleting a proposal deletes its responses
 * first (`deleteProposal`).
 */
export default defineType({
  name: 'feedbackResponse',
  title: 'Feedback Response',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({
      name: 'talk',
      title: 'Talk',
      type: 'reference',
      to: [{ type: 'talk' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'colour',
      title: 'Colour',
      type: 'string',
      options: {
        list: [
          { title: 'Loved it', value: 'green' },
          { title: 'It was OK', value: 'yellow' },
          { title: 'Not for me', value: 'red' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'comment',
      title: 'Comment',
      type: 'text',
      validation: (Rule) => Rule.max(1000),
    }),
    defineField({
      name: 'submittedAt',
      title: 'Submitted at',
      description: 'Server time of the latest answer from this device.',
      type: 'datetime',
    }),
    defineField({
      name: 'flaggedAt',
      title: 'Flagged at',
      description: 'Set when a speaker flags the comment.',
      type: 'datetime',
    }),
    defineField({
      name: 'hiddenAt',
      title: 'Hidden at',
      description: 'Set when an organizer hides the comment.',
      type: 'datetime',
    }),
  ],
  preview: {
    select: { title: 'talk.title', colour: 'colour' },
    prepare: ({ title, colour }) => ({
      title: title ?? 'Feedback Response',
      subtitle: colour,
    }),
  },
})
