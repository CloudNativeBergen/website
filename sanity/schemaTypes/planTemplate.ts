import { defineArrayMember, defineField, defineType } from 'sanity'
import { MILESTONES } from '@/lib/marketing/milestones'
import {
  MARKETING_CHANNELS,
  OUTCOMES,
  SUBJECT_SOURCES,
  TASK_KINDS,
  TRIGGER_EVENTS,
} from '@/lib/marketing/types'

const MILESTONE_OPTIONS = MILESTONES.map((value) => ({ title: value, value }))

const anchor = (name: string, title: string) =>
  defineField({
    name,
    title,
    type: 'object',
    fields: [
      defineField({
        name: 'milestone',
        title: 'Milestone',
        type: 'string',
        options: { list: MILESTONE_OPTIONS },
        validation: (Rule) => Rule.required(),
      }),
      defineField({
        name: 'offsetDays',
        title: 'Offset (days)',
        type: 'number',
        initialValue: 0,
      }),
    ],
  })

/**
 * An organization-owned Plan Template (spec §2.5). Mirrors the code type in
 * `src/lib/marketing/template/types.ts` so organization Templates need no
 * migration later. The built-in Template lives in code; there is no save
 * action and no editor in slice 1. Organization-scoped (read with ORG_FILTER)
 * because a Template seeds several editions.
 */
export default defineType({
  name: 'planTemplate',
  title: 'Plan Template',
  type: 'document',
  fields: [
    defineField({
      name: 'organization',
      title: 'Organization',
      type: 'reference',
      to: [{ type: 'organization' }],
      validation: (Rule) =>
        Rule.required().error('Organization reference is required'),
    }),
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'version',
      title: 'Version',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'campaigns',
      title: 'Campaigns',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'planTemplateCampaign',
          fields: [
            defineField({
              name: 'key',
              title: 'Key',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'title',
              title: 'Title',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            anchor('start', 'Window start'),
            anchor('end', 'Window end'),
            defineField({
              name: 'primaryOutcome',
              title: 'Primary Outcome',
              type: 'string',
              options: { list: [...OUTCOMES] },
            }),
            defineField({
              name: 'outcomeTargetPage',
              title: 'Outcome target page',
              type: 'string',
            }),
            defineField({
              name: 'targetShareOfCapacity',
              title: 'Target as share of ticket capacity',
              type: 'number',
            }),
            defineField({
              name: 'optional',
              title: 'Optional',
              type: 'boolean',
              initialValue: false,
            }),
            defineField({
              name: 'triggers',
              title: 'Triggers',
              type: 'array',
              of: [
                defineArrayMember({
                  type: 'object',
                  name: 'planTemplateTrigger',
                  fields: [
                    defineField({
                      name: 'event',
                      title: 'Event',
                      type: 'string',
                      options: { list: [...TRIGGER_EVENTS] },
                    }),
                    defineField({
                      name: 'taskRecipeKey',
                      title: 'Task recipe key',
                      type: 'string',
                    }),
                  ],
                }),
              ],
            }),
            defineField({
              name: 'recipes',
              title: 'Task recipes',
              type: 'array',
              of: [
                defineArrayMember({
                  type: 'object',
                  name: 'planTemplateRecipe',
                  fields: [
                    defineField({
                      name: 'key',
                      title: 'Key',
                      type: 'string',
                      validation: (Rule) => Rule.required(),
                    }),
                    defineField({
                      name: 'beat',
                      title: 'Beat',
                      type: 'string',
                    }),
                    defineField({
                      name: 'title',
                      title: 'Title',
                      type: 'string',
                    }),
                    defineField({
                      name: 'kind',
                      title: 'Kind',
                      type: 'string',
                      options: { list: [...TASK_KINDS] },
                    }),
                    defineField({
                      name: 'channel',
                      title: 'Channel',
                      type: 'string',
                      options: { list: [...MARKETING_CHANNELS] },
                    }),
                    anchor('anchor', 'Anchor'),
                    defineField({
                      name: 'prerequisites',
                      title: 'Prerequisite recipe keys',
                      type: 'array',
                      of: [defineArrayMember({ type: 'string' })],
                    }),
                    defineField({
                      name: 'targetPage',
                      title: 'Target page',
                      type: 'string',
                    }),
                    defineField({
                      name: 'subjectSource',
                      title: 'Subject source',
                      type: 'string',
                      options: { list: [...SUBJECT_SOURCES] },
                    }),
                    defineField({
                      name: 'skeleton',
                      title: 'Copy skeleton',
                      type: 'text',
                    }),
                    defineField({
                      name: 'alt',
                      title: 'Alt skeleton',
                      type: 'string',
                    }),
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
                        anchor('from', 'From'),
                        anchor('to', 'To'),
                        defineField({
                          name: 'linkedinPerWeek',
                          title: 'LinkedIn per week',
                          type: 'number',
                        }),
                        defineField({
                          name: 'blueskyPerWeek',
                          title: 'Bluesky per week',
                          type: 'number',
                        }),
                      ],
                    }),
                  ],
                  preview: { select: { title: 'title', subtitle: 'key' } },
                }),
              ],
            }),
          ],
          preview: { select: { title: 'title', subtitle: 'key' } },
        }),
      ],
    }),
  ],
  preview: {
    select: { title: 'name', subtitle: 'version' },
  },
})
