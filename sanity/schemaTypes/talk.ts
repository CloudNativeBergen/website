import {
  Status,
  statuses,
  languages,
  levels,
  formats,
} from '../../src/lib/proposal/types'
import { defineField, defineType } from 'sanity'

export default defineType({
  name: 'talk',
  title: 'Talk',
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
      type: 'text',
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
      name: 'outline',
      title: 'Outline',
      type: 'text',
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{ type: 'string' }],
    }),
    defineField({
      name: 'topics',
      title: 'Topics',
      description: 'Topics associated with this talk',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{ type: 'topic' }]
        }
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
      title: 'Speaker',
      type: 'reference',
      to: [{ type: 'speaker' }],
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
        }).regex(
          /^https:\/\/(www\.)?youtube\.com\/watch\?v=.+|^https:\/\/youtu\.be\/.+/,
          {
            name: 'YouTube URL',
            invert: false,
            message: 'Must be a valid YouTube video URL',
          }
        ),
    }),
  ],

  preview: {
    select: {
      title: 'title',
      speaker: 'speaker.name',
    },
    prepare(selection) {
      const { title, speaker } = selection
      return {
        ...selection,
        title: `${title} (${speaker})`,
      }
    },
  },
})
