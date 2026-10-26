import { defineField, defineType } from 'sanity'

/**
 * The agreement tally (Content judgement spec §7.3): an anonymous,
 * platform-wide count of organizers' decisions on content Jev flagged. One
 * document per surface × model build × question set × question × score band,
 * with a deterministic id (`src/lib/content-judgement/tally.ts`), written
 * with `inc` in the same transaction as the organizer's action.
 *
 * DELIBERATELY OUTSIDE TENANCY: it references no content, organization or
 * conference, holds no personal data, and survives every deletion. Written
 * only by the server.
 */
export default defineType({
  name: 'judgementTally',
  title: 'Judgement Tally',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({
      name: 'surface',
      title: 'Surface',
      type: 'string',
      options: {
        list: [
          { title: 'Wall Post', value: 'wallPost' },
          { title: 'Feedback comment', value: 'feedbackComment' },
          { title: 'Conversation', value: 'conversation' },
        ],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'model',
      title: 'Model build',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'questionSet',
      title: 'Question set',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'question',
      title: 'Question',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'band',
      title: 'Score band',
      description:
        'Moderation: [0.5, 0.9) or [0.9, 1]. Categories: confidence < 0.7 or ≥ 0.7.',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'agreed',
      title: 'Agreed',
      description: 'Hide, Remove or Reject on flagged content.',
      type: 'number',
      validation: (Rule) => Rule.required().integer().min(0),
    }),
    defineField({
      name: 'disagreed',
      title: 'Disagreed',
      description: 'Keep or Approve on flagged content.',
      type: 'number',
      validation: (Rule) => Rule.required().integer().min(0),
    }),
  ],
  preview: {
    select: {
      surface: 'surface',
      question: 'question',
      band: 'band',
      agreed: 'agreed',
      disagreed: 'disagreed',
    },
    prepare: ({ surface, question, band, agreed, disagreed }) => ({
      title: `${surface} · ${question} · ${band}`,
      subtitle: `${agreed ?? 0} agreed, ${disagreed ?? 0} disagreed`,
    }),
  },
})
