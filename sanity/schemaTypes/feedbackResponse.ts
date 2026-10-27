import { defineField, defineType } from 'sanity'
import { FEEDBACK_COLOURS, FEEDBACK_COLOUR_LABELS } from '@/lib/feedback/colour'
import { MAX_COMMENT_LENGTH } from '@/lib/feedback/comment'

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
        list: FEEDBACK_COLOURS.map((value) => ({
          title: FEEDBACK_COLOUR_LABELS[value],
          value,
        })),
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'comment',
      title: 'Comment',
      type: 'text',
      validation: (Rule) => Rule.max(MAX_COMMENT_LENGTH),
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
    // Content judgement (spec §7.2, §8.2): the summary a judging task writes
    // beside the comment, and the Keep mark. Never a copy of the text.
    defineField({
      name: 'judgement',
      title: 'Judgement',
      description:
        'Jev’s summary of the comment (Content judgement spec §7.2); the record is a contentJudgement document.',
      type: 'object',
      fields: [
        defineField({
          name: 'state',
          type: 'string',
          options: { list: ['judged', 'notJudged'] },
        }),
        defineField({
          name: 'reasons',
          description: 'Every question at or above 0.5, strongest first.',
          type: 'array',
          of: [
            {
              type: 'object',
              name: 'judgementReason',
              fields: [
                defineField({ name: 'part', type: 'string' }),
                defineField({ name: 'question', type: 'string' }),
                defineField({ name: 'probability', type: 'number' }),
              ],
            },
          ],
        }),
        defineField({
          name: 'notJudgedWhy',
          type: 'string',
          options: { list: ['failed', 'spendCap'] },
        }),
        defineField({ name: 'model', title: 'Model build', type: 'string' }),
        defineField({ name: 'questionSet', type: 'string' }),
        defineField({ name: 'judgedAt', type: 'datetime' }),
        defineField({
          name: 'talliedAt',
          description:
            'When an organizer’s first decision on this Judgement was counted in the agreement tally (§7.3): once per comment.',
          type: 'datetime',
        }),
      ],
    }),
    defineField({
      name: 'keptAt',
      title: 'Kept at',
      description: 'Set when an organizer keeps the comment (§8.2).',
      type: 'datetime',
    }),
    defineField({
      name: 'keptBy',
      title: 'Kept by',
      description:
        'The organizer who kept it; weak, so it never blocks a delete.',
      type: 'reference',
      to: [{ type: 'speaker' }],
      weak: true,
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
