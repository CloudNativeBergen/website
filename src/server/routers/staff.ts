import { TRPCError } from '@trpc/server'
import { revalidateTag } from 'next/cache'
import { router, adminProcedure } from '../trpc'
import { clientWrite } from '@/lib/sanity/client'
import { getAllStaffMembers } from '@/lib/staff/sanity'
import {
  StaffCreateSchema,
  StaffUpdateSchema,
  StaffDeleteSchema,
} from '../schemas/staff'

/**
 * Staff CRUD (SE-4). `staff` are flat, standalone documents listed publicly at
 * `/staff/[role]`; this router replaces editing them in Sanity Studio.
 *
 * IMAGE: `image` is a Sanity image ASSET id (from `/api/admin/speaker-image`),
 * stored as `{ _type: 'image', asset: { _type: 'reference', _ref } }` — the
 * same shape the speaker editor uses.
 *
 * DELETE is UNGUARDED: nothing references a staff document, so removing one can
 * never strand a reference (contrast the topic router's reference guard).
 */

/** Build the stored `image` object from an asset id, or `undefined`. */
function imageField(assetId: string | undefined) {
  if (!assetId) return undefined
  return {
    _type: 'image' as const,
    asset: { _type: 'reference' as const, _ref: assetId },
  }
}

export const staffRouter = router({
  /** Every staff member, ordered by role then name — the admin table source. */
  list: adminProcedure.query(async () => {
    try {
      return await getAllStaffMembers()
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to fetch staff',
        cause: error,
      })
    }
  }),

  create: adminProcedure
    .input(StaffCreateSchema)
    .mutation(async ({ input }) => {
      try {
        const created = await clientWrite.create({
          _type: 'staff',
          name: input.name,
          role: input.role,
          link: input.link,
          ...(input.email ? { email: input.email } : {}),
          ...(input.company ? { company: input.company } : {}),
          ...(imageField(input.image)
            ? { image: imageField(input.image) }
            : {}),
        })
        revalidateTag('content:staff', 'default')
        return { _id: created._id }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create staff member',
          cause: error,
        })
      }
    }),

  update: adminProcedure
    .input(StaffUpdateSchema)
    .mutation(async ({ input }) => {
      const { id, ...rest } = input
      const set: Record<string, unknown> = {}
      const unset: string[] = []

      if (rest.name !== undefined) set.name = rest.name
      if (rest.role !== undefined) set.role = rest.role
      if (rest.link !== undefined) set.link = rest.link
      // Optional fields: null clears (unset), a value sets, absent leaves as-is.
      if (rest.email === null) unset.push('email')
      else if (rest.email !== undefined) set.email = rest.email
      if (rest.company === null) unset.push('company')
      else if (rest.company !== undefined) set.company = rest.company
      if (rest.image === null) unset.push('image')
      else if (rest.image !== undefined) set.image = imageField(rest.image)

      if (Object.keys(set).length === 0 && unset.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No updates provided',
        })
      }

      try {
        let patch = clientWrite.patch(id)
        if (Object.keys(set).length > 0) patch = patch.set(set)
        if (unset.length > 0) patch = patch.unset(unset)
        await patch.commit()
        revalidateTag('content:staff', 'default')
        return { success: true }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update staff member',
          cause: error,
        })
      }
    }),

  delete: adminProcedure
    .input(StaffDeleteSchema)
    .mutation(async ({ input }) => {
      try {
        await clientWrite.delete(input.id)
        revalidateTag('content:staff', 'default')
        return { success: true }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete staff member',
          cause: error,
        })
      }
    }),
})
