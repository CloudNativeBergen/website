import { defineType, defineField } from 'sanity'

/**
 * CLEANUP QUEUE for a Sanity asset a failed gallery upload stored (#1167).
 *
 * The move route never deletes such a file on the spot: Sanity deduplicates
 * identical bytes, so another upload of the same file may be moving at that
 * moment and not yet reference it. The daily sweep
 * (`src/lib/marketing-asset/pending-cleanup.ts`) runs the orphan check once
 * the record is older than any move can take, then removes the record.
 *
 * `assetId` is a plain string, NEVER a reference: a reference would itself
 * keep the asset. No PII: an asset id and a timestamp.
 *
 * Hidden from the Studio structure (see `sanity.config.ts`).
 */
export default defineType({
  name: 'marketingAssetCleanup',
  type: 'document',
  title: 'Marketing Asset Cleanup (internal)',
  __experimental_omnisearch_visibility: false,
  fields: [
    defineField({
      name: 'assetId',
      type: 'string',
      title: 'Sanity asset id',
      readOnly: true,
    }),
    defineField({
      name: 'recordedAt',
      type: 'datetime',
      title: 'Recorded at',
      description:
        'When the failed upload was recorded. The orphan check waits an hour past this.',
      readOnly: true,
    }),
  ],
  preview: {
    select: { title: 'assetId', subtitle: 'recordedAt' },
  },
})
