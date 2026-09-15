import { defineArrayMember, defineField, defineType } from 'sanity'
import { MILESTONES } from '@/lib/marketing/milestones'
import { OUTCOME_LABELS, OUTCOMES, TRIGGER_EVENTS } from '@/lib/marketing/types'

const MILESTONE_OPTIONS = MILESTONES.map((value) => ({ title: value, value }))
const OUTCOME_OPTIONS = OUTCOMES.map((value) => ({
  title: OUTCOME_LABELS[value],
  value,
}))

/**
 * A group of Tasks pursuing one Outcome over a Milestone-anchored window
 * (spec §2.2). `startDate`/`endDate` are MATERIALIZED from the anchors at
 * seeding and on Milestone change; `provisional` flags a fallback date.
 * `conference` is denormalized from the plan so tenant scoping stays flat.
 */
export default defineType({
  name: 'marketingCampaign',
  title: 'Marketing Campaign',
  type: 'document',
  fields: [
    defineField({
      name: 'plan',
      title: 'Plan',
      type: 'reference',
      to: [{ type: 'marketingPlan' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'conference',
      title: 'Conference',
      type: 'reference',
      to: [{ type: 'conference' }],
      validation: (Rule) =>
        Rule.required().error('Conference reference is required'),
    }),
    defineField({
      name: 'key',
      title: 'Key',
      description:
        'Stable Template key (cfp, earlyBird, …) or custom-<uuid>; becomes utm_campaign.',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'startMilestone',
      title: 'Start Milestone',
      type: 'string',
      options: { list: MILESTONE_OPTIONS },
    }),
    defineField({
      name: 'startOffsetDays',
      title: 'Start offset (days)',
      type: 'number',
    }),
    defineField({
      name: 'endMilestone',
      title: 'End Milestone',
      type: 'string',
      options: { list: MILESTONE_OPTIONS },
    }),
    defineField({
      name: 'endOffsetDays',
      title: 'End offset (days)',
      type: 'number',
    }),
    defineField({
      name: 'startDate',
      title: 'Start date',
      description: 'Materialized from the Milestone anchor.',
      type: 'date',
    }),
    defineField({
      name: 'endDate',
      title: 'End date',
      type: 'date',
    }),
    defineField({
      name: 'provisional',
      title: 'Provisional',
      description: 'A window end came from a Milestone fallback.',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'primaryOutcome',
      title: 'Primary Outcome',
      type: 'string',
      options: { list: OUTCOME_OPTIONS },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'outcomeTargetPage',
      title: 'Outcome target page',
      description:
        'Site path the Outcome counts; required for attributedSessions and sponsorContactClicks.',
      type: 'string',
    }),
    defineField({
      name: 'target',
      title: 'Target',
      description: 'Optional number the Outcome is compared against.',
      type: 'number',
    }),
    defineField({
      name: 'triggers',
      title: 'Triggers',
      description:
        'Rules that create draft Tasks from a Task Recipe when a domain event happens.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'marketingTrigger',
          fields: [
            defineField({
              name: 'event',
              title: 'Event',
              type: 'string',
              options: { list: [...TRIGGER_EVENTS] },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'taskRecipeKey',
              title: 'Task recipe key',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
          ],
          preview: {
            select: { title: 'event', subtitle: 'taskRecipeKey' },
          },
        }),
      ],
    }),
    defineField({
      name: 'generatedKeys',
      title: 'Generated Task keys',
      description:
        'Keys of the Tasks Triggers and the recurring expansion have created. A key stays here after its Task is deleted, so a deleted Task is never created again.',
      type: 'array',
      of: [{ type: 'string' }],
      readOnly: true,
    }),
    defineField({
      name: 'optional',
      title: 'Optional',
      description: 'Template metadata: seeding asks before creating.',
      type: 'boolean',
      initialValue: false,
    }),
  ],
  orderings: [
    {
      title: 'Start date',
      name: 'startDateAsc',
      by: [{ field: 'startDate', direction: 'asc' }],
    },
  ],
  preview: {
    select: { title: 'title', key: 'key', start: 'startDate', end: 'endDate' },
    prepare({ title, key, start, end }) {
      return {
        title: title ?? key,
        subtitle: start && end ? `${start} → ${end}` : key,
      }
    },
  },
})
