import { defineType, defineField } from 'sanity'

/**
 * AUDIT RECORD of an erasure run from the admin Privacy page (#1045, #1310).
 * Written by `src/lib/privacy/erasure-log.ts`, one per run, and purged after
 * three years by the `cleanup-notifications` cron.
 *
 * NO PERSONAL DATA OF THE SUBJECT: no email address and no speaker id, only
 * who ran it, for which organization, when, the counts and the outcome.
 *
 * Hidden from the Studio structure (see `STUDIO_HIDDEN_TYPES`).
 */
export default defineType({
  name: 'privacyErasureLog',
  type: 'document',
  title: 'Privacy Erasure Log (internal)',
  __experimental_omnisearch_visibility: false,
  readOnly: true,
  fields: [
    defineField({
      name: 'organization',
      type: 'reference',
      to: [{ type: 'organization' }],
      weak: true,
    }),
    defineField({
      name: 'actor',
      type: 'string',
      description: 'Who ran it: `organizer:<speaker id>`.',
    }),
    defineField({
      name: 'status',
      type: 'string',
      options: { list: ['clean', 'residual', 'failed', 'refused'] },
    }),
    defineField({
      name: 'counts',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'privacyErasureCount',
          fields: [
            defineField({ name: 'kind', type: 'string' }),
            defineField({ name: 'count', type: 'number' }),
          ],
        },
      ],
    }),
    defineField({ name: 'createdAt', type: 'datetime' }),
  ],
})
