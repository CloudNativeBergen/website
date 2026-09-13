import { z } from 'zod'
import { SOCIAL_PLATFORMS } from '@/lib/social/types'

const IsoDateTimeSchema = z.string().datetime({ offset: true })

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
  postId: z.string().min(1),
  defaultScheduledAt: IsoDateTimeSchema,
})

export const ScheduleSocialVariantSchema = z.object({
  variantId: z.string().min(1),
  /**
   * A per-variant time override. Omitted = keep the variant's current
   * `scheduledAt` (the post default), which must then be set.
   */
  scheduledAt: IsoDateTimeSchema.optional(),
})
