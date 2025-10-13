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
        Rule.min(1)
          .max(4)
          .custom((speakers, context) => {
            if (!speakers || !Array.isArray(speakers)) return true

            const document = context.document
            if (!document?.format) return true

            let maxSpeakers = 2

            switch (document.format) {
              case 'lightning_10':
                maxSpeakers = 1
                break
              case 'presentation_20':
              case 'presentation_25':
                maxSpeakers = 2
                break
              case 'presentation_40':
              case 'presentation_45':
                maxSpeakers = 3
                break
              case 'workshop_120':
              case 'workshop_240':
                maxSpeakers = 4
                break
            }

            if (speakers.length > maxSpeakers) {
              const formatNames = {
                lightning_10: 'Lightning talks',
                presentation_20: 'Short presentations',
                presentation_25: 'Short presentations',
                presentation_40: 'Longer presentations',
                presentation_45: 'Longer presentations',
                workshop_120: 'Workshops',
                workshop_240: 'Long workshops',
              }
              const formatName =
                formatNames[document.format as keyof typeof formatNames] ||
                'This format'
              return `${formatName} can have at most ${maxSpeakers} speaker${maxSpeakers > 1 ? 's' : ''}`
            }

            return true
          }),
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
    defineField({
      name: 'capacity',
      title: 'Workshop Capacity',
      type: 'number',
      description:
        'Maximum number of participants for workshop sessions (default: 30)',
      initialValue: 30,
      hidden: ({ document }) => {
        const format = document?.format as string | undefined
        const capacity = document?.capacity as number | undefined
        const isWorkshop =
          format === 'workshop_120' || format === 'workshop_240'
        return !(isWorkshop || (capacity !== undefined && capacity !== null))
      },
      validation: (Rule) =>
        Rule.integer()
          .min(1)
          .max(200)
          .custom((capacity, context) => {
            const format = context.document?.format as string | undefined
            const isWorkshop =
              format === 'workshop_120' || format === 'workshop_240'
            const hasValue = capacity !== undefined && capacity !== null

            if (hasValue && !isWorkshop) {
              return 'Capacity can only be set for workshop formats'
            }

            if (isWorkshop && hasValue) {
              if (typeof capacity !== 'number')
                return 'Capacity must be a number'
              if (!Number.isInteger(capacity))
                return 'Capacity must be a whole number'
              if (capacity < 1) return 'Capacity must be at least 1'
              if (capacity > 200)
                return 'Capacity cannot exceed 200 participants'
            }
            return true
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
