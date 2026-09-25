import { z } from 'zod'
import { MARKETING_ASSET_SUBJECT_TYPES } from './types'

export const MARKETING_ASSET_MAX_TAGS = 20
export const MARKETING_ASSET_MAX_TAG_LENGTH = 40

/**
 * A published document id. A draft (`drafts.x`) or Content Release version
 * (`versions.r.x`) is never something to mark an asset with.
 */
const documentId = z
  .string()
  .min(1)
  .max(200)
  .refine((id) => !id.includes('.'), 'Not a published document id')

/** A tag as stored: trimmed and lower-cased, so a filter matches it whole. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  for (const tag of tags) {
    const clean = tag.trim().replace(/\s+/g, ' ').toLowerCase()
    if (clean) seen.add(clean)
  }
  return [...seen]
}

/**
 * The details an organizer sets on an asset (spec §3), for the upload route
 * and `marketingAsset.update` alike. Only the SHAPE is checked here; that the
 * edition and the subject belong to this organization is the server's guard.
 */
export const marketingAssetDetailsSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    alt: z.string().trim().min(1).max(1000),
    scope: z.enum(['organization', 'edition']),
    conferenceId: documentId.optional(),
    subject: z
      .object({ type: z.enum(MARKETING_ASSET_SUBJECT_TYPES), id: documentId })
      .nullish(),
    tags: z
      .array(z.string().max(MARKETING_ASSET_MAX_TAG_LENGTH))
      .max(MARKETING_ASSET_MAX_TAGS)
      .default([])
      .transform(normalizeTags),
    credit: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((credit) => credit || undefined),
  })
  .refine(
    (details) => (details.scope === 'edition') === !!details.conferenceId,
    {
      message:
        'An edition asset needs its edition, and only an edition asset has one',
      path: ['conferenceId'],
    },
  )

export type ParsedMarketingAssetDetails = z.output<
  typeof marketingAssetDetailsSchema
>
