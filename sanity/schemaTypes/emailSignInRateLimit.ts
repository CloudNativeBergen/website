import { defineType, defineField } from 'sanity'

/**
 * RATE-LIMIT COUNTER for email sign-in link requests.
 *
 * One document per (scope, subject) pair, addressed by a DETERMINISTIC `_id`
 * (`emailSignInRate.<sha256(scope:subject)>`) so the document set is bounded by
 * the number of distinct requesters rather than by the number of requests.
 *
 * NO PII AT REST: the subject (an email address or a client IP) is never
 * stored — only its salted hash, which is already the document id. The `scope`
 * field exists so the cleanup cron and any operator investigation can tell the
 * two counter families apart without being able to reverse either.
 *
 * Platform-internal and global (no `organization` reference): abuse control is
 * a platform property, not a tenant one — a burst aimed at one tenant must be
 * counted against the same bucket everywhere.
 *
 * Hidden from the Studio structure (see `sanity.config.ts`).
 */
export default defineType({
  name: 'emailSignInRateLimit',
  type: 'document',
  title: 'Email Sign-In Rate Limit (internal)',
  __experimental_omnisearch_visibility: false,
  fields: [
    defineField({
      name: 'scope',
      type: 'string',
      title: 'Scope',
      description: 'Which counter family this bucket belongs to.',
      options: { list: ['email', 'ip'] },
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
