import { defineField, defineType } from 'sanity'

/**
 * How one speaker gets to the speaker dinner at one conference (#1592, phase 5).
 * Written by the speaker from the dashboard, so it lives off the conference
 * document. Id: `dinnerChoice.<conferenceId>.<speakerId>`.
 */
export default defineType({
  name: 'speakerDinnerChoice',
  title: 'Speaker Dinner Choice',
  type: 'document',
  fields: [
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'speaker',
      title: 'Speaker',
      type: 'reference',
      to: [{ type: 'speaker' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'choice',
      title: 'Choice',
      type: 'string',
      description:
        'A `_key` from the conference `speakerInfo.dinner.routes`, or `own` or `not-coming`.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'updatedAt',
      title: 'Updated At',
      type: 'datetime',
    }),
  ],
  preview: {
    select: { speaker: 'speaker.name', choice: 'choice' },
    prepare: ({ speaker, choice }) => ({ title: speaker, subtitle: choice }),
  },
})
