import { z } from 'zod'
import { SITE_PATH_MAX_LENGTH, sitePathIssue } from '@/lib/marketing/pages'
import {
  SOCIAL_ALT_MAX_LENGTH,
  SOCIAL_LINK_MAX_LENGTH,
  SOCIAL_PLATFORMS,
} from '@/lib/social/types'

/**
 * Accepts any ISO-8601 instant and NORMALIZES it to UTC `Z` form: `scheduledAt`
 * is compared as a string in the due scan and by `Date` in the engine, so an
 * offset form (`…+02:00`) must never reach storage.
 */
export const IsoDateTimeSchema = z
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
export const LiveDocumentIdSchema = z
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
  postId: LiveDocumentIdSchema,
  defaultScheduledAt: IsoDateTimeSchema,
})

export const ScheduleSocialVariantSchema = z.object({
  variantId: LiveDocumentIdSchema,
  /**
   * A per-variant time override. Omitted = keep the variant's current
   * `scheduledAt` (the post default), which must then be set.
   */
  scheduledAt: IsoDateTimeSchema.optional(),
})

export const SocialVariantIdSchema = z.object({
  variantId: LiveDocumentIdSchema,
})

export const SocialPostIdSchema = z.object({ postId: LiveDocumentIdSchema })

/** Spec §3.2: "mark as posted" REQUIRES the post URL. */
export const MarkSocialVariantPostedSchema = z.object({
  variantId: LiveDocumentIdSchema,
  url: z
    .string()
    .max(2048)
    .url()
    .refine((value) => /^https?:\/\//.test(value), {
      message: 'Post URL must start with http:// or https://',
    }),
})

/** A Sanity image asset id from OUR dataset (never a URL). */
const ImageAssetIdSchema = z
  .string()
  .regex(
    /^image-[a-f0-9]{40}-\d{1,5}x\d{1,5}-(jpg|jpeg|png|webp|gif|avif)$/,
    'Not an image asset of this dataset',
  )

const UnitSchema = z.number().min(0).max(1)

export const AttachmentCropSchema = z
  .object({
    x: UnitSchema,
    y: UnitSchema,
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  })
  .refine((r) => r.x + r.width <= 1.000001 && r.y + r.height <= 1.000001, {
    message: 'Crop must stay inside the image',
  })

export const VariantAttachmentSchema = z.object({
  source: z.string().min(1).max(200),
  crop: AttachmentCropSchema.nullable(),
  altOverride: z.string().trim().max(SOCIAL_ALT_MAX_LENGTH).nullable(),
})

/**
 * Timing is an explicit choice, never inferred from a null: `default`
 * re-attaches the variant to the post's time (so a later edit of the post
 * default cascades to it again); `custom` pins it.
 */
export const VariantTimingSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('default') }),
  z.object({ mode: z.literal('custom'), scheduledAt: IsoDateTimeSchema }),
])

const LinkSchema = z
  .string()
  .trim()
  .max(SOCIAL_LINK_MAX_LENGTH)
  .refine((value) => /^https?:\/\/\S+$/i.test(value), {
    message: 'The link must start with http:// or https://',
  })

/** A path on our own site, as the page picker or a custom-path field yields it. */
export const SitePathSchema = z
  .string()
  .trim()
  .max(SITE_PATH_MAX_LENGTH)
  .superRefine((value, ctx) => {
    const issue = sitePathIssue(value)
    if (issue) ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue })
  })

export const UpdateSocialVariantSchema = z.object({
  variantId: LiveDocumentIdSchema,
  /** The revision the editor LOADED — the compare-and-set target. */
  rev: z.string().min(1).max(200),
  body: z
    .string()
    .max(10_000)
    .refine((value) => value.trim().length > 0, {
      message: 'Body is required',
    }),
  link: LinkSchema.nullable(),
  attachments: z.array(VariantAttachmentSchema).max(20),
  timing: VariantTimingSchema,
  /**
   * The Marketing Task this variant belongs to (spec §3.4): the target page
   * is saved on the Task and the tagged link is DERIVED server-side and
   * written into `link` — `link` above is ignored when this is present.
   */
  task: z
    .object({ taskId: LiveDocumentIdSchema, targetPage: SitePathSchema })
    .optional(),
})

export const AddSocialPostAttachmentSchema = z.object({
  postId: LiveDocumentIdSchema,
  assetId: ImageAssetIdSchema,
  alt: z
    .string()
    .trim()
    .min(1, 'Alt text is required')
    .max(SOCIAL_ALT_MAX_LENGTH),
  hotspot: z
    .object({
      x: UnitSchema,
      y: UnitSchema,
      width: UnitSchema.default(1),
      height: UnitSchema.default(1),
    })
    .nullable()
    .optional(),
  crop: z
    .object({
      top: UnitSchema,
      bottom: UnitSchema,
      left: UnitSchema,
      right: UnitSchema,
    })
    .refine((c) => c.left + c.right < 1 && c.top + c.bottom < 1, {
      message: 'Crop must leave part of the image',
    })
    .nullable()
    .optional(),
})
