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
  hotspot: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0).max(1),
      height: z.number().min(0).max(1),
    })
    .optional(),
  crop: z
    .object({
      top: z.number().min(0).max(1),
      bottom: z.number().min(0).max(1),
      left: z.number().min(0).max(1),
      right: z.number().min(0).max(1),
    })
    .optional(),
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

export const galleryImageUntagSelfSchema = z.object({
  imageId: z.string().min(1, 'Image ID is required'),
})
