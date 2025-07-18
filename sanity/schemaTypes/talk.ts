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
      title: 'Speaker',
      type: 'reference',
      to: [{ type: 'speaker' }],
    }),
    defineField({
      name: 'coSpeakers',
      title: 'Co-Speakers',
      description: 'Additional speakers for this talk (not allowed for lightning talks)',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{ type: 'speaker' }],
        },
      ],
      validation: (Rule) =>
        Rule.custom((coSpeakers, context) => {
          const format = context.document?.format
          if (format === 'lightning_10' && coSpeakers && coSpeakers.length > 0) {
            return 'Lightning talks (10 min) cannot have co-speakers'
          }
          return true
        }),
    }),
    defineField({
      name: 'coSpeakerInvitations',
      title: 'Co-Speaker Invitations',
      description: 'Pending invitations for co-speakers',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'email',
              title: 'Email',
              type: 'string',
              validation: (Rule) => Rule.email(),
            },
            {
              name: 'status',
              title: 'Status',
              type: 'string',
              options: {
                list: [
                  { value: 'pending', title: 'Pending' },
                  { value: 'accepted', title: 'Accepted' },
                  { value: 'rejected', title: 'Rejected' },
                  { value: 'expired', title: 'Expired' },
                ],
              },
              initialValue: 'pending',
            },
            {
              name: 'invitedAt',
              title: 'Invited At',
              type: 'datetime',
            },
            {
              name: 'respondedAt',
              title: 'Responded At',
              type: 'datetime',
            },
            {
              name: 'token',
              title: 'Invitation Token',
              type: 'string',
              description: 'Unique token for invitation link',
            },
          ],
        },
      ],
      hidden: true, // Hide from studio UI as this is managed through the application
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
      speaker: 'speaker.name',
      coSpeaker0: 'coSpeakers.0.name',
      coSpeaker1: 'coSpeakers.1.name',
      coSpeaker2: 'coSpeakers.2.name',
    },
    prepare(selection) {
      const { title, speaker, coSpeaker0, coSpeaker1, coSpeaker2 } = selection
      const coSpeakers = [coSpeaker0, coSpeaker1, coSpeaker2].filter(Boolean)
      const speakerList = [speaker, ...coSpeakers].filter(Boolean).join(', ')
      return {
        ...selection,
        title: `${title} (${speakerList})`,
      }
    },
  },
})
