import { defineArrayMember, defineField, defineType } from 'sanity'
import { MILESTONES } from '@/lib/marketing/milestones'
import {
  MARKETING_CHANNELS,
  OUTCOME_LABELS,
  OUTCOMES,
  SUBJECT_SOURCES,
  TASK_KINDS,
  TRIGGER_EVENTS,
} from '@/lib/marketing/types'

const MILESTONE_OPTIONS = MILESTONES.map((value) => ({ title: value, value }))
const OUTCOME_OPTIONS = OUTCOMES.map((value) => ({
  title: OUTCOME_LABELS[value],
  value,
}))

/** A Milestone plus whole days, as a Recipe stores it. */
const anchorField = (name: string, title: string) =>
  defineField({
    name,
    title,
    type: 'object',
    fields: [
      defineField({
        name: 'milestone',
        type: 'string',
        options: { list: MILESTONE_OPTIONS },
      }),
      defineField({ name: 'offsetDays', type: 'number' }),
    ],
  })

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
      // WEAK. A strong reference makes Sanity refuse to delete the target,
      // and deletion commits its Task chunks first — so a referrer we failed to
      // enumerate destroyed the Tasks and then wedged the plan permanently.
      // Three review rounds each found a different referrer; the reference
      // strength is the bug, not the enumeration. Required still holds.
      weak: true,
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
      name: 'recipes',
      title: 'Task Recipes',
      description:
        'Every Recipe of this Campaign, static ones included. Triggers, the recurring expansion and plan copy read these and nothing else, so the plan is frozen at the Recipes it was given.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'marketingRecipe',
          fields: [
            defineField({
              name: 'key',
              title: 'Key',
              description: 'Stable within the Campaign; becomes utm_content.',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'beat',
              title: 'Beat',
              description: 'Sibling Recipes (one per Channel) share a beat.',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({ name: 'title', title: 'Title', type: 'string' }),
            defineField({
              name: 'kind',
              title: 'Kind',
              type: 'string',
              options: { list: [...TASK_KINDS] },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'channel',
              title: 'Channel',
              type: 'string',
              options: { list: [...MARKETING_CHANNELS] },
            }),
            defineField({
              name: 'subjectSource',
              title: 'Subject',
              type: 'string',
              options: { list: [...SUBJECT_SOURCES] },
            }),
            anchorField('anchor', 'Anchor'),
            defineField({
              name: 'prerequisites',
              title: 'Prerequisites',
              description: 'Recipe keys in this Campaign to complete first.',
              type: 'array',
              of: [{ type: 'string' }],
            }),
            defineField({
              name: 'targetPage',
              title: 'Target page',
              type: 'string',
            }),
            defineField({
              name: 'skeleton',
              title: 'Copy skeleton',
              type: 'text',
            }),
            defineField({ name: 'alt', title: 'Alt skeleton', type: 'text' }),
            defineField({
              name: 'instructions',
              title: 'Instructions',
              type: 'text',
            }),
            defineField({
              name: 'cadence',
              title: 'Cadence',
              type: 'object',
              fields: [
                anchorField('from', 'From'),
                anchorField('to', 'To'),
                defineField({
                  name: 'perWeek',
                  title: 'Posts per week',
                  type: 'object',
                  fields: MARKETING_CHANNELS.map((channel) =>
                    defineField({ name: channel, type: 'number' }),
                  ),
                }),
                defineField({
                  name: 'subjects',
                  title: 'Subject list',
                  type: 'string',
                  options: {
                    list: [
                      'confirmedSpeakers',
                      'scheduledTalks',
                      'recordedTalks',
                    ],
                  },
                }),
              ],
            }),
          ],
          preview: { select: { title: 'title', subtitle: 'key' } },
        }),
      ],
    }),
    defineField({
      name: 'generatedKeys',
      title: 'Generated Task keys',
      description:
        'Keys of the Tasks Triggers, the recurring expansion and the countdown have created. A key stays here after its Task is deleted, so a deleted Task is never created again.',
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
