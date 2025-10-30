import { z } from 'zod'

export const galleryImageCreateSchema = z.object({
  photographer: z.string().min(1, 'Photographer name is required'),
  date: z.string().datetime('Date must be a valid ISO 8601 datetime'),
  location: z.string().min(1, 'Location is required'),
  conference: z.string().min(1, 'Conference is required'),
  featured: z.boolean().optional(),
  speakers: z.array(z.string()).optional(),
  imageAlt: z.string().optional(),
})

export const galleryImageUpdateSchema = z.object({
  id: z.string().min(1, 'Image ID is required'),
  photographer: z.string().min(1).optional(),
  date: z
    .string()
    .datetime('Date must be a valid ISO 8601 datetime')
    .optional(),
  location: z.string().min(1).optional(),
  conference: z.string().min(1).optional(),
  featured: z.boolean().optional(),
  speakers: z.array(z.string()).optional(),
  imageAlt: z.string().optional(),
  notifySpeakers: z.boolean().optional().default(false),
})

export const galleryImageFilterSchema = z.object({
  featured: z.boolean().optional(),
  speakerId: z.string().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  photographerSearch: z.string().optional(),
  locationSearch: z.string().optional(),
  limit: z.number().max(100).default(50),
  offset: z.number().min(0).default(0),
})

export const galleryImageDeleteSchema = z.object({
  id: z.string().min(1, 'Image ID is required'),
})

export const galleryImageToggleFeaturedSchema = z.object({
  id: z.string().min(1, 'Image ID is required'),
  featured: z.boolean(),
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type GalleryImageCreateInput = z.infer<typeof galleryImageCreateSchema>
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type GalleryImageUpdateInput = z.infer<typeof galleryImageUpdateSchema>
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type GalleryImageFilterInput = z.infer<typeof galleryImageFilterSchema>
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type GalleryImageDeleteInput = z.infer<typeof galleryImageDeleteSchema>
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type GalleryImageToggleFeaturedInput = z.infer<
  typeof galleryImageToggleFeaturedSchema
>
