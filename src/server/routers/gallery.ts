import { TRPCError } from '@trpc/server'
import { adminProcedure, router } from '../trpc'
import {
  galleryImageUpdateSchema,
  galleryImageFilterSchema,
  galleryImageDeleteSchema,
  galleryImageToggleFeaturedSchema,
} from '@/server/schemas/gallery'
import {
  getGalleryImages,
  getGalleryImageCount,
  updateGalleryImage,
  deleteGalleryImage,
  getGalleryImageStats,
} from '@/lib/gallery/sanity'
import { getAllConferences } from '@/lib/conference/sanity'

export const galleryRouter = router({
  list: adminProcedure
    .input(galleryImageFilterSchema)
    .query(async ({ input }) => {
      try {
        const images = await getGalleryImages({
          featured: input.featured,
          speakerId: input.speakerId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          photographerSearch: input.photographerSearch,
          locationSearch: input.locationSearch,
          limit: input.limit,
          offset: input.offset,
        })
        return images
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch gallery images',
          cause: error,
        })
      }
    }),

  update: adminProcedure
    .input(galleryImageUpdateSchema)
    .mutation(async ({ input }) => {
      try {
        const { id, ...updateData } = input
        const res = await updateGalleryImage(id, updateData)
        if (!res.image) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: res.error || 'Failed to update gallery image',
          })
        }
        return res.image
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update gallery image',
          cause: error,
        })
      }
    }),

  delete: adminProcedure
    .input(galleryImageDeleteSchema)
    .mutation(async ({ input }) => {
      try {
        const ok = await deleteGalleryImage(input.id)
        if (!ok) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete gallery image',
          })
        }
        return { success: ok }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete gallery image',
          cause: error,
        })
      }
    }),

  toggleFeatured: adminProcedure
    .input(galleryImageToggleFeaturedSchema)
    .mutation(async ({ input }) => {
      try {
        const res = await updateGalleryImage(input.id, {
          featured: input.featured,
        })
        if (!res.image) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: res.error || 'Failed to toggle featured status',
          })
        }
        return res.image
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to toggle featured status',
          cause: error,
        })
      }
    }),

  stats: adminProcedure.query(async () => {
    try {
      const stats = await getGalleryImageStats()
      return stats
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch gallery statistics',
        cause: error,
      })
    }
  }),

  count: adminProcedure
    .input(galleryImageFilterSchema)
    .query(async ({ input }) => {
      try {
        const count = await getGalleryImageCount({
          featured: input.featured,
          speakerId: input.speakerId,
          dateFrom: input.dateFrom,
          dateTo: input.dateTo,
          photographerSearch: input.photographerSearch,
          locationSearch: input.locationSearch,
        })
        return count
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch gallery image count',
          cause: error,
        })
      }
    }),

  conferences: adminProcedure.query(async () => {
    try {
      const { conferences, error } = await getAllConferences()
      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch conferences',
          cause: error,
        })
      }
      return conferences
    } catch (error) {
      if (error instanceof TRPCError) throw error
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch conferences',
        cause: error,
      })
    }
  }),
})