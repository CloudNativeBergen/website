import { defineArrayMember, defineField, defineType } from 'sanity'
import {
  ATTEMPT_OUTCOMES,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_PLATFORMS,
  VARIANT_STATUSES,
  type VariantStatus,
} from '@/lib/social/types'

const PLATFORMS = SOCIAL_PLATFORMS.map((value) => ({
  title: SOCIAL_PLATFORM_LABELS[value],
  value,
}))

const STATUS_TITLES: Record<VariantStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  publishing: 'Publishing',
  submitted: 'Submitted to publisher',
  'awaiting-manual': 'Awaiting manual post',
  published: 'Published',
  failed: 'Failed',
}

const STATUSES = VARIANT_STATUSES.map((value) => ({
  title: STATUS_TITLES[value],
  value,
}))

/**
 * One platform's rendition of a `socialPost` — THE schedulable, publishable
 * unit (dashboard #786, #788). A separate document rather than an embedded
 * array so the per-minute cron can run a flat due-scan
 * (`status == "scheduled" && scheduledAt <= now()`) and claim each variant with
 * a compare-and-set on its revision. `scheduledAt` is DENORMALIZED: it mirrors
 * the post's default time until `usesCustomTime` is set.
 *
 * `conference` is denormalized from the post so tenant scoping stays flat.
 */
export default defineType({
  name: 'socialPostVariant',
  title: 'Social Post Variant',
  type: 'document',
  // READ-ONLY IN STUDIO. The status machine is owned by the publish cron
  // and the social.* procedures, which write the LIVE document with
  // compare-and-set. A Studio edit snapshots a draft with the status as it
  // was, and Publish would replay that stale status over a variant the cron
  // has since posted — a second post. Edit variants through the admin.
  readOnly: true,
  fields: [
    defineField({
      name: 'post',
      title: 'Post',
      type: 'reference',
      to: [{ type: 'socialPost' }],
      // WEAK. A strong reference makes Sanity refuse to delete the post, and
      // plan deletion commits its Task chunks first — so one stray variant
      // (another edition's, a release version, a draft) destroyed the Tasks and
      // then wedged the plan. `deletePlanTree` decides on its own whether a
      // post still has a variant that needs it; it must not be told by an error
      // raised after the irreversible half has committed. Required still holds.
      weak: true,
      validation: (Rule) => Rule.required().error('Post reference is required'),
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
      name: 'platform',
      title: 'Platform',
      type: 'string',
      options: { list: PLATFORMS, layout: 'radio' },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      description:
        'Copied from the post at fan-out, then edited independently.',
      type: 'text',
      rows: 6,
    }),
    defineField({
      name: 'attachments',
      title: 'Attachments',
      description:
        'Which post attachments this variant carries, in order, with an optional per-variant crop and alt override.',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          name: 'socialPostVariantAttachment',
          fields: [
            defineField({
              name: 'source',
              title: 'Post attachment key',
              type: 'string',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'crop',
              title: 'Crop',
              description:
                'Normalized rect (0–1) overriding the platform default crop.',
              type: 'object',
              fields: [
                defineField({ name: 'x', type: 'number' }),
                defineField({ name: 'y', type: 'number' }),
                defineField({ name: 'width', type: 'number' }),
                defineField({ name: 'height', type: 'number' }),
              ],
            }),
            defineField({
              name: 'altOverride',
              title: 'Alt text override',
              type: 'string',
            }),
          ],
        }),
      ],
    }),
    defineField({
      name: 'link',
      title: 'Link',
      description:
        'The tagged link this variant points at; adapters build their link embed from it.',
      type: 'url',
    }),
    defineField({
      name: 'shortCode',
      title: 'Short code',
      description:
        'The `/go/<code>` short link for this variant. Minted once when the Task is created and never changed; `link` above stays the long tagged URL.',
      type: 'string',
      readOnly: true,
    }),
    defineField({
      name: 'scheduledAt',
      title: 'Scheduled at',
      description:
        'Effective publish time. Follows the post default unless a custom time is set.',
      type: 'datetime',
    }),
    defineField({
      name: 'usesCustomTime',
      title: 'Uses custom time',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: { list: STATUSES },
      initialValue: 'draft',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'claimedAt',
      title: 'Claimed at',
      description:
        'When the cron took the publishing claim. A stale claim is failed, never re-posted.',
      type: 'datetime',
      readOnly: true,
    }),
    defineField({
      name: 'submission',
      title: 'Submission',
      description:
        'The receipt from an asynchronous publisher while the post is submitted: ITS post id, not the platform one. The confirm sweep reads it back.',
      type: 'object',
      readOnly: true,
      fields: [
        defineField({
          name: 'vendorPostId',
          title: 'Publisher post id',
          type: 'string',
        }),
        defineField({
          name: 'submittedAt',
          title: 'Submitted at',
          type: 'datetime',
        }),
        defineField({
          name: 'lastCheckedAt',
          title: 'Last checked at',
          type: 'datetime',
        }),
      ],
    }),
    defineField({
      name: 'publishResult',
      title: 'Publish result',
      type: 'object',
      readOnly: true,
      fields: [
        defineField({
          name: 'externalId',
          title: 'External id',
          type: 'string',
        }),
        defineField({ name: 'url', title: 'URL', type: 'url' }),
      ],
    }),
    defineField({
      name: 'attempts',
      title: 'Attempts',
      description: 'Audit trail: one entry per attempt outcome.',
      type: 'array',
      readOnly: true,
      of: [
        defineArrayMember({
          type: 'object',
          name: 'socialPublishAttempt',
          fields: [
            defineField({ name: 'at', title: 'At', type: 'datetime' }),
            defineField({
              name: 'outcome',
              title: 'Outcome',
              type: 'string',
              options: { list: [...ATTEMPT_OUTCOMES] },
            }),
            defineField({ name: 'error', title: 'Error', type: 'text' }),
            defineField({
              name: 'by',
              title: 'By',
              type: 'reference',
              to: [{ type: 'speaker' }],
              weak: true,
            }),
          ],
          preview: {
            select: { title: 'outcome', subtitle: 'at' },
          },
        }),
      ],
    }),
    defineField({
      name: 'attemptCount',
      title: 'Attempts this cycle',
      description:
        'Reset when an organizer (re-)schedules; the retry cap counts this, the audit trail above keeps everything.',
      type: 'number',
      readOnly: true,
      initialValue: 0,
    }),
    defineField({
      name: 'updatedAt',
      title: 'Updated at',
      type: 'datetime',
      readOnly: true,
    }),
  ],
  orderings: [
    {
      title: 'Scheduled time',
      name: 'scheduledAtAsc',
      by: [{ field: 'scheduledAt', direction: 'asc' }],
    },
  ],
  preview: {
    select: { platform: 'platform', status: 'status', body: 'body' },
    prepare({ platform, status, body }) {
      return {
        title: `${platform ?? '?'} · ${status ?? 'draft'}`,
        subtitle: body ? String(body).slice(0, 80) : undefined,
      }
    },
  },
})
