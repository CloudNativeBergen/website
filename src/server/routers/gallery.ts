import { TRPCError } from '@trpc/server'
import { adminProcedure, protectedProcedure, router } from '../trpc'
import {
  galleryImageUpdateSchema,
  galleryImageFilterSchema,
  galleryImageDeleteSchema,
  galleryImageToggleFeaturedSchema,
  galleryImageUntagSelfSchema,
} from '@/server/schemas/gallery'
import {
  getGalleryImages,
  getGalleryImageCount,
  updateGalleryImage,
  deleteGalleryImage,
  untagSpeakerFromImage,
} from '@/lib/gallery/sanity'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

export const galleryRouter = router({
  list: adminProcedure
    .input(galleryImageFilterSchema)
    .query(async ({ input }) => {
      try {
        const { conference } = await getConferenceForCurrentDomain({
          revalidate: 0,
        })
        if (!conference) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Conference not found for current domain',
          })
        }

        const images = await getGalleryImages(
          {
            conferenceId: conference._id,
            featured: input.featured,
            speakerId: input.speakerId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            photographerSearch: input.photographerSearch,
            locationSearch: input.locationSearch,
            limit: input.limit,
            offset: input.offset,
          },
          { useCache: false },
        )
        return images
      } catch (error) {
        if (error instanceof TRPCError) throw error
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

  count: adminProcedure
    .input(galleryImageFilterSchema)
    .query(async ({ input }) => {
      try {
        const { conference } = await getConferenceForCurrentDomain({
          revalidate: 0,
        })
        if (!conference) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Conference not found for current domain',
          })
        }

        const count = await getGalleryImageCount(
          {
            conferenceId: conference._id,
            featured: input.featured,
            speakerId: input.speakerId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            photographerSearch: input.photographerSearch,
            locationSearch: input.locationSearch,
          },
          false,
        )
        return count
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch gallery image count',
          cause: error,
        })
      }
    }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    try {
      const images = await getGalleryImages({
        speakerId: ctx.speaker._id,
        limit: 50,
        offset: 0,
      })
      return images
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch your photos',
        cause: error,
      })
    }
  }),

  countMine: protectedProcedure.query(async ({ ctx }) => {
    try {
      const count = await getGalleryImageCount({
        speakerId: ctx.speaker._id,
      })
      return count
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to count your photos',
        cause: error,
      })
    }
  }),

  untagSelf: protectedProcedure
    .input(galleryImageUntagSelfSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await untagSpeakerFromImage(
          input.imageId,
          ctx.speaker._id,
        )

        if (!result.success) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: result.error || 'Failed to untag yourself from photo',
          })
        }

        return { success: true }
      } catch (error) {
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to untag yourself from photo',
          cause: error,
        })
      }
    }),
})
