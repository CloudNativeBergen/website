import { TRPCError } from '@trpc/server'
import {
  adminProcedure,
  protectedProcedure,
  resolveConferenceId,
  resolveOrganizationId,
  router,
} from '../trpc'
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
  getGalleryImageTenant,
  updateGalleryImage,
  deleteGalleryImage,
  untagSpeakerFromImage,
} from '@/lib/gallery/sanity'

/**
 * The current request's org id, or NOT_FOUND. `resolveOrganizationId` returns
 * `null` on an unresolvable host; a gallery read must never continue with that
 * (an unscoped gallery query returns every tenant's photos), so this throws.
 */
async function requireCurrentOrgId(): Promise<string> {
  const orgId = await resolveOrganizationId()
  if (!orgId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Could not resolve organization from domain',
    })
  }
  return orgId
}

/**
 * Every gallery mutation takes an image id from CLIENT INPUT, so each one must
 * prove the image belongs to the caller's tenant before touching it — otherwise
 * an organizer of tenant A can edit or delete tenant B's photos by id. Admin
 * mutations require the CONFERENCE (the surface they manage); the speaker's
 * self-untag requires only the ORG, so it keeps working across editions.
 * Fails closed: a missing image, or one with no conference, is NOT_FOUND.
 */
async function requireImageInConference(imageId: string): Promise<string> {
  const conferenceId = await resolveConferenceId()
  const tenant = await getGalleryImageTenant(imageId)
  if (!tenant?.conferenceId || tenant.conferenceId !== conferenceId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Gallery image not found for this conference',
    })
  }
  return conferenceId
}

async function requireImageInOrg(imageId: string): Promise<void> {
  const orgId = await requireCurrentOrgId()
  const tenant = await getGalleryImageTenant(imageId)
  if (!tenant?.orgId || tenant.orgId !== orgId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Gallery image not found',
    })
  }
}

export const galleryRouter = router({
  admin: router({
    list: adminProcedure
      .input(galleryImageFilterSchema)
      .query(async ({ input }) => {
        try {
          // `resolveConferenceId` THROWS on an unresolvable host. The previous
          // `if (!conference)` guard never fired — `getConferenceForDomain`
          // returns a truthy `{} as Conference` — so an unknown host reached the
          // query with `conferenceId: undefined` and read every tenant's images.
          const conferenceId = await resolveConferenceId()

          const images = await getGalleryImages(
            {
              conferenceId,
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
          const conferenceId = await requireImageInConference(id)
          // A patch may not MOVE an image to another tenant's conference.
          if (updateData.conference && updateData.conference !== conferenceId) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot reassign a gallery image to another conference',
            })
          }
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
          await requireImageInConference(input.id)
          const ok = await deleteGalleryImage(input.id)
          if (!ok) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to delete gallery image',
            })
          }
          return { success: ok }
        } catch (error) {
          if (error instanceof TRPCError) throw error
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
          await requireImageInConference(input.id)
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
          // Fail closed on an unresolvable host — see `admin.list` above.
          const conferenceId = await resolveConferenceId()

          const count = await getGalleryImageCount(
            {
              conferenceId,
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
  }),

  // A speaker's own photos, SCOPED TO THE CURRENT TENANT'S ORG (#616):
  // previously this filtered on `speakerId` alone, so a speaker tagged in two
  // orgs' galleries was served BOTH orgs' photos from either host. The scope is
  // the ORG (not the single conference) so a speaker keeps seeing their photos
  // from every edition of the same organizer — unchanged for the CND editions,
  // which all belong to one org.
  listMine: protectedProcedure.query(async ({ ctx }) => {
    try {
      const orgId = await requireCurrentOrgId()
      const images = await getGalleryImages({
        orgId,
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
      const orgId = await requireCurrentOrgId()
      const count = await getGalleryImageCount({
        orgId,
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
        await requireImageInOrg(input.imageId)
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
