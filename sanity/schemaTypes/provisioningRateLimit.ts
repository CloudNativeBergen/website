import { defineType, defineField } from 'sanity'

/**
 * RATE-LIMIT COUNTER for the machine API RunKonf/kontroll calls (#753,
 * RunKonf/platform#36).
 *
 * Same shape and same mechanics as `emailSignInRateLimit` — both ride the one
 * bucket primitive in `src/lib/rate-limit/bucket.ts` — kept as a separate type
 * so the two counter families have independent retention and can never
 * interfere: a sign-in burst must not consume the budget that bounds tenant
 * creation.
 *
 * Four scopes, one pre-auth/post-auth pair per endpoint. They share this
 * document TYPE (and therefore its cleanup cron) but never a bucket: the scope
 * is part of the id digest, so invalidation traffic cannot crowd out
 * provisioning.
 *  - `attempt` / `invalidate-attempt` — one bucket per client IP, charged
 *    BEFORE the bearer token is checked. This is the bound on brute-forcing the
 *    shared secret.
 *  - `create` — a SINGLE global bucket, charged after authentication. This is
 *    the bound on bulk tenant minting if the secret ever leaks, and it is
 *    deliberately not keyed on anything a caller can rotate.
 *  - `invalidate` — likewise global and post-authentication: with the per-call
 *    target cap it is what stops a leaked secret from being used to drop every
 *    tenant's cached reads in a loop.
 *
 * NO PII AT REST: the subject is never stored — only its salted hash, which is
 * already the document id.
 *
 * Hidden from the Studio structure (see `sanity.config.ts`).
 */
export default defineType({
  name: 'provisioningRateLimit',
  type: 'document',
  title: 'Provisioning Rate Limit (internal)',
  __experimental_omnisearch_visibility: false,
  fields: [
    defineField({
      name: 'scope',
      type: 'string',
      title: 'Scope',
      description: 'Which counter family this bucket belongs to.',
      options: {
        list: ['attempt', 'create', 'invalidate-attempt', 'invalidate'],
      },
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
