import { defineType, defineField } from 'sanity'

/**
 * IDEMPOTENCY RECEIPT for a machine provisioning request (#753).
 *
 * `POST /api/provisioning/organizations` requires an `Idempotency-Key`. One of
 * these documents is created INSIDE the same transaction as the organization,
 * addressed by a DETERMINISTIC `_id` (`provisioningRequest.<sha256(key +
 * AUTH_SECRET)>`). Sanity's `create` on an explicit id fails if the document
 * exists and the transaction is atomic, so a replayed key cannot commit a
 * second organization no matter how the two requests interleave — the receipt
 * IS the compare-and-swap, not a bookkeeping side effect.
 *
 * It also makes the retry SAFE rather than merely refused: the stored ids are
 * returned verbatim to a caller whose first response was lost, so a timeout can
 * never strand a tenant the control panel does not know about.
 *
 * NO KEY AT REST: the caller's key is never stored — only its salted hash,
 * which is already the document id. Salted (like `storedTokenDocId`) so a
 * reader of the content lake cannot confirm a guessed key and replay with it.
 *
 * Platform-internal and global (no `organization` reference): the record
 * predates the tenant it created. Purged 30 days after creation by the daily
 * cleanup cron; hidden from the Studio structure (see `sanity.config.ts`).
 */
export default defineType({
  name: 'provisioningRequest',
  type: 'document',
  title: 'Provisioning Request (internal)',
  __experimental_omnisearch_visibility: false,
  fields: [
    defineField({
      name: 'organizationId',
      type: 'string',
      title: 'Organization id',
      description: 'The organization this request created.',
      readOnly: true,
    }),
    defineField({
      name: 'conferenceId',
      type: 'string',
      title: 'Conference id',
      description: "The tenant's first conference.",
      readOnly: true,
    }),
    defineField({
      name: 'speakerId',
      type: 'string',
      title: 'Organizer speaker id',
      description: 'The speaker document holding the organizer membership.',
      readOnly: true,
    }),
    defineField({
      name: 'speakerCreated',
      type: 'boolean',
      title: 'Organizer account created',
      description:
        'False when the organizer email matched an existing speaker that was patched instead.',
      readOnly: true,
    }),
    defineField({
      name: 'domains',
      type: 'array',
      title: 'Claimed domains',
      description:
        'Replayed back so a retry can re-project the DNS challenges without re-reading the conference.',
      of: [{ type: 'string' }],
      readOnly: true,
    }),
    defineField({
      name: 'createdAt',
      type: 'datetime',
      title: 'Created at',
      readOnly: true,
    }),
    defineField({
      name: 'expiresAt',
      type: 'datetime',
      title: 'Expires at',
      description:
        'After this the daily cleanup cron deletes the receipt and the same key would provision again.',
      readOnly: true,
    }),
  ],
  preview: {
    select: { title: 'organizationId', subtitle: 'createdAt' },
  },
})
