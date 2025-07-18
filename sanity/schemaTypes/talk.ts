import {
  Status,
  statuses,
  languages,
  levels,
  formats,
  audiences,
} from '../../src/lib/proposal/types'
import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'talk',
  title: 'Talk Proposal',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'array',
      of: [{ type: 'block' }],
    }),
    defineField({
      name: 'language',
      title: 'Language',
      type: 'string',
      options: {
        list: Array.from(languages).map(([value, title]) => ({ value, title })),
      },
    }),
    defineField({
      name: 'format',
      title: 'Format',
      type: 'string',
      options: {
        list: Array.from(formats).map(([value, title]) => ({ value, title })),
      },
    }),
    defineField({
      name: 'level',
      title: 'Level',
      type: 'string',
      options: {
        list: Array.from(levels).map(([value, title]) => ({ value, title })),
      },
    }),
    defineField({
      name: 'audiences',
      title: 'Audience',
      type: 'array',
      of: [{ type: 'string' }],
      options: {
        list: Array.from(audiences).map(([value, title]) => ({ value, title })),
      },
    }),
    defineField({
      name: 'outline',
      title: 'Outline',
      type: 'text',
    }),
    defineField({
      name: 'topics',
      title: 'Topics',
      description: 'Topics associated with this talk',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{ type: 'topic' }],
        },
      ],
    }),
    defineField({
      name: 'tos',
      title: 'Terms of Service',
      type: 'boolean',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      initialValue: Status.draft,
      options: {
        list: Array.from(statuses).map(([value, title]) => ({ value, title })),
      },
    }),
    defineField({
      name: 'speaker',
      title: 'Speaker (Deprecated)',
      type: 'reference',
      to: [{ type: 'speaker' }],
      deprecated: {
        reason: 'Use speakers array instead of single speaker reference',
      },
      hidden: true,
    }),
    defineField({
      name: 'speakers',
      title: 'Speakers',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{ type: 'speaker' }],
        },
      ],
      validation: (Rule) =>
        Rule.min(1).max(3).error('Please select 1-3 speakers'),
    }),
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'video',
      title: 'YouTube Video',
      type: 'url',
      description: 'Link to a published YouTube video for this talk',
      validation: (Rule) =>
        Rule.uri({
          scheme: ['http', 'https'],
          allowRelative: false,
        }),
    }),
  ],

  preview: {
    select: {
      title: 'title',
      speakers: 'speakers',
    },
    prepare(selection) {
      const { title, speakers } = selection
      const speakerNames =
        speakers?.map((speaker: any) => speaker.name).join(', ') ||
        'No speakers'
      return {
        ...selection,
        title: `${title} (${speakerNames})`,
      }
    },
  },
})
