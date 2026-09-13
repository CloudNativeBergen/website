import { defineArrayMember, defineField, defineType } from 'sanity'

const PLATFORMS = [
  { title: 'LinkedIn', value: 'linkedin' },
  { title: 'Bluesky', value: 'bluesky' },
  { title: 'X', value: 'x' },
  { title: 'Facebook', value: 'facebook' },
  { title: 'Instagram', value: 'instagram' },
  { title: 'Threads', value: 'threads' },
  { title: 'Mastodon', value: 'mastodon' },
]

const STATUSES = [
  { title: 'Draft', value: 'draft' },
  { title: 'Scheduled', value: 'scheduled' },
  { title: 'Publishing', value: 'publishing' },
  { title: 'Awaiting manual post', value: 'awaiting-manual' },
  { title: 'Published', value: 'published' },
  { title: 'Failed', value: 'failed' },
]

const ATTEMPT_OUTCOMES = [
  'published',
  'manual',
  'credential-expired',
  'rate-limited',
  'rejected',
  'transient',
  'ambiguous',
  'stale-claim',
]

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
  fields: [
    defineField({
      name: 'post',
      title: 'Post',
      type: 'reference',
      to: [{ type: 'socialPost' }],
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
              options: { list: ATTEMPT_OUTCOMES },
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
