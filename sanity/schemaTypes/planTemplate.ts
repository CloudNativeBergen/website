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
 * An organization-owned Plan Template (Templates spec §2.4): ONE DOCUMENT PER
 * TEMPLATE VERSION, with the id `planTemplate.<templateId>.v<version>` so two
 * concurrent saves cannot both become version n+1. Mirrors the code type in
 * `src/lib/marketing/template/types.ts`. A version is never patched after it
 * is written, except that rename patches `name` on every version. Holds
 * Recipes, never Tasks. Organization-scoped (read with ORG_FILTER) because a
 * Template seeds several editions.
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
      name: 'templateId',
      title: 'Template id',
      description: 'Stable across the versions of one Template.',
      type: 'string',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'version',
      title: 'Version',
      type: 'number',
      readOnly: true,
      validation: (Rule) => Rule.required().integer().min(1),
    }),
    defineField({
      name: 'savedFrom',
      title: 'Saved from',
      description: 'The edition whose plan this version was saved from.',
      type: 'reference',
      to: [{ type: 'conference' }],
      weak: true,
      readOnly: true,
    }),
    defineField({
      name: 'savedBy',
      title: 'Saved by',
      type: 'reference',
      to: [{ type: 'speaker' }],
      weak: true,
      readOnly: true,
    }),
    defineField({
      name: 'savedAt',
      title: 'Saved at',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'restoredFrom',
      title: 'Restored from version',
      description:
        'Set when this version was written by restoring an older one.',
      type: 'number',
      readOnly: true,
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
              name: 'target',
              title: 'Default Target',
              type: 'object',
              fields: [
                defineField({
                  name: 'shareOfCapacity',
                  title: 'Share of ticket capacity',
                  type: 'number',
                }),
              ],
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
                      name: 'verbatim',
                      title: 'Verbatim copy',
                      type: 'boolean',
                    }),
                    defineField({
                      name: 'tagSubject',
                      title: 'Tag the subject',
                      description:
                        'Generated Bluesky copy tags the speaker with their Bluesky handle instead of their name.',
                      type: 'boolean',
                    }),
                    defineField({
                      name: 'alt',
                      title: 'Alt skeleton',
                      type: 'text',
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
                          name: 'perWeek',
                          title: 'Posts per week',
                          type: 'object',
                          fields: [
                            defineField({
                              name: 'linkedin',
                              title: 'LinkedIn',
                              type: 'number',
                            }),
                            defineField({
                              name: 'bluesky',
                              title: 'Bluesky',
                              type: 'number',
                            }),
                          ],
                        }),
                        defineField({
                          name: 'subjects',
                          title: 'Subject list',
                          type: 'string',
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
