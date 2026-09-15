import {
  Status,
  statuses,
  languages,
  levels,
  formats,
  audiences,
} from '../../src/lib/proposal/types'
import type { Format } from '../../src/lib/proposal/types'
import { getTotalSpeakerLimit } from '../../src/lib/cospeaker/constants'
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
      description: 'Title of the talk or workshop proposal',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'array',
      description: 'Public-facing abstract shown on the program page',
      of: [{ type: 'block' }],
    }),
    defineField({
      name: 'language',
      title: 'Language',
      type: 'string',
      description: 'Presentation language',
      options: {
        list: Array.from(languages).map(([value, title]) => ({ value, title })),
      },
    }),
    defineField({
      name: 'format',
      title: 'Format',
      type: 'string',
      description: 'Session format (lightning, presentation, or workshop)',
      options: {
        list: Array.from(formats).map(([value, title]) => ({ value, title })),
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'level',
      title: 'Level',
      type: 'string',
      description: 'Technical difficulty level',
      options: {
        list: Array.from(levels).map(([value, title]) => ({ value, title })),
      },
    }),
    defineField({
      name: 'audiences',
      title: 'Audience',
      type: 'array',
      description: 'Target audience for this session',
      of: [{ type: 'string' }],
      options: {
        list: Array.from(audiences).map(([value, title]) => ({ value, title })),
      },
    }),
    defineField({
      name: 'outline',
      title: 'Outline',
      type: 'text',
      description: 'Internal outline visible to reviewers (not public)',
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
      description: 'Whether the speaker accepted the terms of service',
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      description: 'Current status in the proposal review workflow',
      initialValue: Status.draft,
      options: {
        list: Array.from(statuses).map(([value, title]) => ({ value, title })),
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'withdrawnReason',
      title: 'Withdrawal reason',
      type: 'text',
      rows: 3,
      readOnly: true,
      description:
        'Speaker-provided reason recorded when a proposal is withdrawn. Set automatically by the withdrawal flow.',
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
      // The per-format speaker limit is a CFP-SUBMISSION rule, not an invariant
      // of the data (#1023): organizers may deliberately exceed it, e.g. after
      // switching a talk to a smaller format. So it rides on a SEPARATE
      // `Rule.warning()` and there is no hard `.max()`. The level comes from the
      // Rule, never from the object a `.custom()` returns — returning
      // `{level: 'warning'}` type-checks and still produces an error marker.
      // `min(1)` must stay OUTSIDE `.warning()` or the required minimum goes
      // advisory too. Covered by __tests__/sanity/talk-speaker-limit.test.ts.
      // The numbers come from `CO_SPEAKER_LIMITS` — never re-hardcode them here.
      validation: (Rule) => [
        Rule.min(1),
        Rule.warning().custom((speakers, context) => {
          if (!Array.isArray(speakers)) return true

          const format = context.document?.format
          if (!format) return true

          const limit = getTotalSpeakerLimit(format as Format)
          if (speakers.length <= limit) return true

          return `This format allows ${limit} speaker${limit > 1 ? 's' : ''} at submission. ${speakers.length} are listed — fine if that is deliberate.`
        }),
      ],
    }),
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'attachments',
      title: 'Attachments',
      type: 'array',
      description: 'Slides, recordings, and other resources for this talk',
      of: [{ type: 'fileAttachment' }, { type: 'urlAttachment' }],
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
    defineField({
      name: 'prerequisites',
      title: 'Prerequisites',
      type: 'text',
      description:
        'Prerequisites for workshop participants (e.g., "Bring a computer with Docker installed")',
      hidden: ({ document }) => {
        const format = document?.format as string | undefined
        const prerequisites = document?.prerequisites as string | undefined
        const isWorkshop =
          format === 'workshop_120' || format === 'workshop_240'
        return !(
          isWorkshop ||
          (prerequisites !== undefined && prerequisites !== null)
        )
      },
    }),
    defineField({
      name: 'issuedSpeakerTickets',
      title: 'Issued Speaker Tickets',
      type: 'array',
      description:
        'System-managed record of complimentary speaker ticket emails that were successfully delivered. Used to avoid re-emailing a speaker while still allowing recovery when a coupon was created but the email failed. The coupon code itself is intentionally never stored here (the ticketing provider is its source of truth) so co-speakers reading the proposal cannot see each other’s codes. Not intended for manual editing.',
      readOnly: true,
      of: [
        {
          type: 'object',
          fields: [
            { name: 'speakerId', title: 'Speaker ID', type: 'string' },
            { name: 'email', title: 'Delivered To (Email)', type: 'string' },
            { name: 'emailedAt', title: 'Emailed At', type: 'datetime' },
          ],
          preview: {
            select: { title: 'email', subtitle: 'speakerId' },
          },
        },
      ],
    }),
    defineField({
      name: 'audienceFeedback',
      title: 'Audience Feedback',
      type: 'object',
      description: 'Physical card feedback collected during the session',
      fields: [
        {
          name: 'greenCount',
          title: 'Green Cards',
          type: 'number',
          initialValue: 0,
          validation: (Rule) => Rule.integer().min(0),
        },
        {
          name: 'yellowCount',
          title: 'Yellow Cards',
          type: 'number',
          initialValue: 0,
          validation: (Rule) => Rule.integer().min(0),
        },
        {
          name: 'redCount',
          title: 'Red Cards',
          type: 'number',
          initialValue: 0,
          validation: (Rule) => Rule.integer().min(0),
        },
        {
          name: 'lastUpdatedAt',
          title: 'Last Updated',
          type: 'datetime',
        },
      ],
    }),
    defineField({
      name: 'utm',
      title: 'Marketing attribution',
      description:
        'FIRST-TOUCH: the campaign tags on the link the speaker arrived through, captured once at submission and never rewritten by a later edit. Read by the Campaign ledger to tell which Campaign a proposal came from (spec §6.3).',
      type: 'object',
      readOnly: true,
      options: { collapsible: true, collapsed: true },
      fields: [
        { name: 'source', title: 'Source', type: 'string' },
        { name: 'medium', title: 'Medium', type: 'string' },
        {
          name: 'campaign',
          title: 'Campaign',
          description:
            'The marketingCampaign key this proposal is credited to.',
          type: 'string',
        },
        {
          name: 'content',
          title: 'Content',
          description:
            'The marketingTask key of the post that carried the link.',
          type: 'string',
        },
      ],
    }),
  ],

  preview: {
    select: {
      title: 'title',
      speaker0: 'speakers.0.name',
      speaker1: 'speakers.1.name',
      speaker2: 'speakers.2.name',
      speaker3: 'speakers.3.name',
    },
    prepare({ title, speaker0, speaker1, speaker2, speaker3 }) {
      const names = [speaker0, speaker1, speaker2, speaker3].filter(Boolean)
      const speakerNames = names.length > 0 ? names.join(', ') : 'No speakers'
      return {
        title: `${title} (${speakerNames})`,
      }
    },
  },
})
