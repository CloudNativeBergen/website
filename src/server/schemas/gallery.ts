import { z } from 'zod'

export const galleryImageCreateSchema = z.object({
  photographer: z.string().min(1, 'Photographer name is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  location: z.string().min(1, 'Location is required'),
  featured: z.boolean().optional(),
  speakers: z.array(z.string()).optional(),
  imageAlt: z.string().optional(),
})

export const galleryImageUpdateSchema = z.object({
  id: z.string().min(1, 'Image ID is required'),
  photographer: z.string().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  location: z.string().min(1).optional(),
  featured: z.boolean().optional(),
  speakers: z.array(z.string()).optional(),
  imageAlt: z.string().optional(),
})

export const galleryImageFilterSchema = z.object({
  featured: z.boolean().optional(),
  speakerId: z.string().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
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

export type GalleryImageCreateInput = z.infer<typeof galleryImageCreateSchema>
export type GalleryImageUpdateInput = z.infer<typeof galleryImageUpdateSchema>
export type GalleryImageFilterInput = z.infer<typeof galleryImageFilterSchema>
export type GalleryImageDeleteInput = z.infer<typeof galleryImageDeleteSchema>
export type GalleryImageToggleFeaturedInput = z.infer<typeof galleryImageToggleFeaturedSchema>