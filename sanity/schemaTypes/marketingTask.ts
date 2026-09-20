import { defineArrayMember, defineField, defineType } from 'sanity'
import { MILESTONES } from '@/lib/marketing/milestones'
import {
  MARKETING_CHANNEL_LABELS,
  MARKETING_CHANNELS,
  TASK_KIND_LABELS,
  TASK_KINDS,
  TASK_ORIGINS,
  TASK_STATUSES,
} from '@/lib/marketing/types'

/**
 * One unit of marketing work in a Campaign, of one Kind (spec §2.3).
 *
 * A publishing Task reads its scheduled time and status from its variant
 * (the posting core's source of truth) and carries no `dueAt`/`status` of
 * its own. Non-publishing Kinds carry both. The tagged link is derived, never
 * stored. `plan` and `conference` are denormalized for flat scans.
 */
export default defineType({
  name: 'marketingTask',
  title: 'Marketing Task',
  type: 'document',
  fields: [
    defineField({
      name: 'plannedAt',
      title: 'Last planned instant',
      description:
        'Last instant computed by the plan. A different current time preserves the organizer’s choice.',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'campaign',
      title: 'Campaign',
      type: 'reference',
      to: [{ type: 'marketingCampaign' }],
      // WEAK. A strong reference makes Sanity refuse to delete the target,
      // and deletion commits its Task chunks first — so a referrer we failed to
      // enumerate destroyed the Tasks and then wedged the plan permanently.
      // Three review rounds each found a different referrer; the reference
      // strength is the bug, not the enumeration. Required still holds.
      weak: true,
      validation: (Rule) => Rule.required(),
    }),
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
        'Template recipe key plus subject (speakerCard:<speakerId>:bluesky) or custom-<uuid>; becomes utm_content.',
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
      name: 'kind',
      title: 'Kind',
      type: 'string',
      options: {
        list: TASK_KINDS.map((value) => ({
          title: TASK_KIND_LABELS[value],
          value,
        })),
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'channel',
      title: 'Channel',
      description:
        'Required for publishing; an optional label for other Kinds.',
      type: 'string',
      options: {
        list: MARKETING_CHANNELS.map((value) => ({
          title: MARKETING_CHANNEL_LABELS[value],
          value,
        })),
      },
    }),
    defineField({
      name: 'milestone',
      title: 'Milestone',
      description: 'Anchor; absent for Trigger-created Tasks.',
      type: 'string',
      options: { list: MILESTONES.map((value) => ({ title: value, value })) },
    }),
    defineField({
      name: 'offsetDays',
      title: 'Offset (days)',
      type: 'number',
    }),
    defineField({
      name: 'dueAt',
      title: 'Due at',
      description:
        'Non-publishing Kinds only; publishing Tasks read the variant.',
      type: 'datetime',
    }),
    defineField({
      name: 'provisional',
      title: 'Provisional',
      description: 'The date came from a Milestone fallback.',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      description: 'Non-publishing Kinds only.',
      type: 'string',
      options: { list: [...TASK_STATUSES] },
    }),
    defineField({
      name: 'approvedBy',
      title: 'Approved by',
      type: 'reference',
      to: [{ type: 'speaker' }],
      weak: true,
    }),
    defineField({
      name: 'approvedAt',
      title: 'Approved at',
      type: 'datetime',
    }),
    defineField({
      name: 'assignee',
      title: 'Assignee',
      description: 'Defaults to the plan owner.',
      type: 'reference',
      to: [{ type: 'speaker' }],
      weak: true,
    }),
    defineField({
      name: 'prerequisites',
      title: 'Prerequisites',
      description:
        'Tasks in the same Campaign that should complete first. Informational; never blocks approval.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'reference',
          to: [{ type: 'marketingTask' }],
          weak: true,
        }),
      ],
    }),
    defineField({
      name: 'variant',
      title: 'Variant',
      description:
        'Publishing Kind: the social post variant created with the Task.',
      type: 'reference',
      to: [{ type: 'socialPostVariant' }],
      weak: true,
    }),
    defineField({
      name: 'targetPage',
      title: 'Target page',
      description:
        'Publishing and outreach Kinds: site path the tagged link points at. The link itself is derived, never stored.',
      type: 'string',
    }),
    defineField({
      name: 'subject',
      title: 'Subject',
      description:
        'What the Task is about; drives placeholders and the studio preselection.',
      type: 'reference',
      to: [{ type: 'speaker' }, { type: 'sponsor' }, { type: 'talk' }],
      weak: true,
    }),
    defineField({
      name: 'asset',
      title: 'Asset',
      description:
        'studioRender output; publishing Tasks with a render Prerequisite pull it.',
      type: 'image',
    }),
    defineField({
      name: 'pendingStudioAsset',
      title: 'Pending studio upload',
      type: 'image',
      hidden: true,
      readOnly: true,
    }),
    defineField({
      name: 'handoffDoneFor',
      title: 'Studio handoff receipts',
      description:
        'Variant IDs already handled for the saved render. Pending delivery is derived from current Prerequisites.',
      type: 'array',
      of: [{ type: 'string' }],
      readOnly: true,
    }),
    defineField({
      name: 'alt',
      title: 'Alt text',
      description:
        'Resolved alt-text skeleton for the image the beat carries; copied onto the post attachment when the render is attached.',
      type: 'string',
    }),
    defineField({
      name: 'instructions',
      title: 'Instructions',
      description: 'checklist / eventPageUpdate body.',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'externalUrl',
      title: 'External URL',
      description: 'eventPageUpdate: optional pasted URL.',
      type: 'url',
    }),
    defineField({
      name: 'skipReason',
      title: 'Skip reason',
      description: 'Non-publishing Kinds: why the Task was skipped.',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'messageId',
      title: 'Message id',
      description:
        'Outreach Kinds: the message sent, which completes the Task.',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'remindedAt',
      title: 'Reminded at',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'overdueNudgedAt',
      title: 'Overdue nudged at',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'copyEdited',
      title: 'Copy edited by an organizer',
      description:
        'Set when someone saves the post with a different body. Copying the plan to the next edition rewrites untouched copy and keeps edited copy.',
      type: 'boolean',
      readOnly: true,
    }),
    defineField({
      name: 'verbatimCopy',
      title: 'Copy saved verbatim from a previous edition',
      description:
        'Set when the plan was seeded from a Template whose Recipe kept an edition’s literal copy. The Task editor asks for a review.',
      type: 'boolean',
      readOnly: true,
    }),
    defineField({
      name: 'origin',
      title: 'Origin',
      type: 'string',
      options: { list: [...TASK_ORIGINS] },
      readOnly: true,
    }),
  ],
  orderings: [
    {
      title: 'Due',
      name: 'dueAtAsc',
      by: [{ field: 'dueAt', direction: 'asc' }],
    },
  ],
  preview: {
    select: { title: 'title', kind: 'kind', channel: 'channel', key: 'key' },
    prepare({ title, kind, channel, key }) {
      return {
        title: title ?? key,
        subtitle: [kind, channel].filter(Boolean).join(' · '),
      }
    },
  },
})
