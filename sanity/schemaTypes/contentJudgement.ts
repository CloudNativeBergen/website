import { defineField, defineType } from 'sanity'

/**
 * A Judgement (Content judgement spec §7.1): Jev's typed answer about one
 * piece of user-written content, one document per judged content with a
 * deterministic id, so the latest Judgement replaces the previous one.
 * Written only by the server.
 *
 * It holds NO copy of the judged text or photo, only a SHA-256 of what was
 * sent. The content reference is weak, so deleting the content is never
 * blocked; the daily orphan sweep (§12) deletes Judgements left behind.
 */
export default defineType({
  name: 'contentJudgement',
  title: 'Content Judgement',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) => Rule.required(),
    }),
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
      name: 'content',
      title: 'Content',
      type: 'reference',
      to: [
        { type: 'wallPost' },
        { type: 'feedbackResponse' },
        { type: 'conversation' },
      ],
      weak: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'parts',
      title: 'Parts',
      description:
        'One entry per Judgement: caption and photo for a Wall Post, comment, or opening.',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'judgementPart',
          fields: [
            defineField({
              name: 'part',
              type: 'string',
              options: { list: ['caption', 'photo', 'comment', 'opening'] },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'answers',
              type: 'array',
              of: [
                {
                  type: 'object',
                  name: 'judgementAnswer',
                  fields: [
                    defineField({ name: 'question', type: 'string' }),
                    defineField({
                      name: 'probability',
                      description: 'For yes/no questions.',
                      type: 'number',
                    }),
                    defineField({
                      name: 'choice',
                      description: 'For the Message Category.',
                      type: 'string',
                    }),
                    defineField({
                      name: 'probabilities',
                      description: 'Probability per category.',
                      type: 'array',
                      of: [
                        {
                          type: 'object',
                          name: 'choiceProbability',
                          fields: [
                            defineField({ name: 'choice', type: 'string' }),
                            defineField({
                              name: 'probability',
                              type: 'number',
                            }),
                          ],
                        },
                      ],
                    }),
                    defineField({ name: 'confidence', type: 'number' }),
                  ],
                },
              ],
            }),
          ],
        },
      ],
    }),
    defineField({
      name: 'model',
      title: 'Model build',
      description: 'The build that answered, e.g. typesafe/jev-1.14-20261014.',
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
      name: 'contentHash',
      title: 'Content hash',
      description: 'SHA-256 of exactly what was sent (text and image bytes).',
      type: 'string',
      validation: (Rule) => Rule.required().regex(/^[a-f0-9]{64}$/),
    }),
    defineField({
      name: 'inputTokens',
      title: 'Input tokens',
      type: 'number',
    }),
    defineField({
      name: 'judgedAt',
      title: 'Judged at',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: { title: 'surface', subtitle: 'judgedAt' },
  },
})
