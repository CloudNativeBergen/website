import { defineType, defineField } from 'sanity'

/**
 * RATE-LIMIT COUNTER for the Marketing Plan's on-demand actions (#1018).
 *
 * Same shape and same mechanics as `emailSignInRateLimit` and
 * `provisioningRateLimit` — all three ride the one bucket primitive in
 * `src/lib/rate-limit/bucket.ts` — kept as its own type so the families have
 * independent retention and can never interfere: an organizer hammering
 * "refresh" must not consume the budget that bounds tenant creation.
 *
 * ONE SCOPE today: `snapshot-refresh`, one bucket per CONFERENCE, charged
 * after authorization. What it bounds is cost, not abuse — every refresh is a
 * PostHog query and a Bluesky sweep against a metered quota, and the daily
 * cron already keeps the ledger current without anybody pressing anything.
 *
 * NO PII AT REST: the subject is a conference id, and only its salted hash is
 * written — which is already the document id.
 *
 * Hidden from the Studio structure (see `sanity.config.ts`).
 */
export default defineType({
  name: 'marketingRateLimit',
  type: 'document',
  title: 'Marketing Rate Limit (internal)',
  __experimental_omnisearch_visibility: false,
  fields: [
    defineField({
      name: 'scope',
      type: 'string',
      title: 'Scope',
      description: 'Which counter family this bucket belongs to.',
      options: { list: ['snapshot-refresh'] },
      readOnly: true,
    }),
    defineField({
      name: 'hits',
      type: 'array',
      title: 'Hit timestamps (epoch ms)',
      description:
        'Request timestamps inside the longest tracked window. Pruned on every write.',
      of: [{ type: 'number' }],
      readOnly: true,
    }),
    defineField({
      name: 'expiresAt',
      type: 'datetime',
      title: 'Expires at',
      description:
        'When the last tracked hit leaves the longest window. The nightly cleanup cron deletes documents past this.',
      readOnly: true,
    }),
  ],
  preview: {
    select: { title: 'scope', subtitle: 'expiresAt' },
  },
})
