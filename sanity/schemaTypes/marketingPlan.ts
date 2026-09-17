import { defineField, defineType } from 'sanity'

/**
 * The team-owned set of Campaigns for one conference edition (spec §2.1).
 * One plan per edition: the document id is `marketingPlan.<conferenceId>`.
 * Written by the `marketing.*` procedures; Studio edits are for repair only.
 */
export default defineType({
  name: 'marketingPlan',
  title: 'Marketing Plan',
  type: 'document',
  fields: [
    defineField({
      name: 'lastRedatedAt',
      title: 'Last re-date run',
      description:
        'Serializes re-dating and rotates the daily sweep to the plans waiting longest.',
      type: 'datetime',
      readOnly: true,
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
      name: 'owner',
      title: 'Owner',
      description: 'Delegable; the default assignee for Tasks.',
      type: 'reference',
      to: [{ type: 'speaker' }],
      weak: true,
    }),
    defineField({
      name: 'templateVersion',
      title: 'Template version',
      description:
        'Version of the built-in Template that seeded the plan, or copy:<sourcePlanId>.',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'copiedFrom',
      title: 'Copied from',
      type: 'reference',
      to: [{ type: 'marketingPlan' }],
      weak: true,
      readOnly: true,
    }),
    defineField({
      name: 'lastExpandedAt',
      title: 'Last expansion run',
      description:
        'When the expansion cron last ran for this plan. The cron serves the plans it has left waiting longest first, so a busy platform never starves an edition.',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'lastRemindedAt',
      title: 'Last reminder run',
      description:
        'When reminders last ran for this plan. The cron serves the plans waiting longest first so the per-run cap does not starve an edition.',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'lastSnapshotAt',
      title: 'Last snapshot run',
      description:
        'When the snapshot cron last ran for this plan. Ordered by, exactly as lastExpandedAt is, so the edition waiting longest is served first.',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'createdAt',
      title: 'Created at',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'updatedAt',
      title: 'Updated at',
      type: 'datetime',
      readOnly: true,
    }),
  ],
  preview: {
    select: { conference: 'conference.title', version: 'templateVersion' },
    prepare({ conference, version }) {
      return {
        title: `Marketing plan · ${conference ?? '?'}`,
        subtitle: version ? `Template ${version}` : undefined,
      }
    },
  },
})
