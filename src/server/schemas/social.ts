import { z } from 'zod'
import { SOCIAL_PLATFORMS } from '@/lib/social/types'

/**
 * Accepts any ISO-8601 instant and NORMALIZES it to UTC `Z` form: `scheduledAt`
 * is compared as a string in the due scan and by `Date` in the engine, so an
 * offset form (`…+02:00`) must never reach storage.
 */
const IsoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString())
  // An offset can push year 0000/9999 into a signed six-digit year that
  // GROQ's dateTime() cannot parse — such a variant would never come due.
  .refine((value) => /^\d{4}-/.test(value), {
    message: 'Date must fall within years 0000–9999 in UTC',
  })

/**
 * A Sanity document id. Draft twins (`drafts.<id>`) and Content Release
 * copies (`versions.<release>.<id>`) are refused: a mutation must act on the
 * live document, or a later Publish would replay a stale status over a
 * variant the cron already posted.
 */
const IdSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) => !value.startsWith('drafts.') && !value.startsWith('versions.'),
    { message: 'Only the live document can be scheduled' },
  )

export const SocialPlatformSchema = z.enum(SOCIAL_PLATFORMS)

export const CreateSocialPostSchema = z.object({
  body: z.string().trim().min(1, 'Body is required').max(5000),
  /** ISO datetime; null/omitted = no default time yet. */
  defaultScheduledAt: IsoDateTimeSchema.nullable().optional(),
  platforms: z
    .array(SocialPlatformSchema)
    .min(1, 'Pick at least one platform')
    .refine((list) => new Set(list).size === list.length, {
      message: 'Each platform at most once',
    }),
})

export const UpdateSocialPostDefaultTimeSchema = z.object({
  postId: IdSchema,
  defaultScheduledAt: IsoDateTimeSchema,
})

export const ScheduleSocialVariantSchema = z.object({
  variantId: IdSchema,
  /**
   * A per-variant time override. Omitted = keep the variant's current
   * `scheduledAt` (the post default), which must then be set.
   */
  scheduledAt: IsoDateTimeSchema.optional(),
})

/** Spec §3.2: "mark as posted" REQUIRES the post URL. */
export const MarkSocialVariantPostedSchema = z.object({
  variantId: IdSchema,
  url: z
    .string()
    .max(2048)
    .url()
    .refine((value) => /^https?:\/\//.test(value), {
      message: 'Post URL must start with http:// or https://',
    }),
})
