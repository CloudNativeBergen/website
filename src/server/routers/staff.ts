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
import { organizationField } from '@/lib/organization/sanity'
import { requireCurrentOrgId, requireDocumentInCurrentOrg } from '../tenancy'

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
        const image = imageField(input.image)
        // Stamp the current conference's organization (CaaS T1-1) so the staff
        // member is born tenant-owned. Best-effort: absent before 044 backfill.
        // FAIL CLOSED (#730): a staff document born WITHOUT an org is owned by
        // no tenant — invisible to `getAllStaffMembers` (already org-scoped) and
        // refused by the ownership guard on update/delete. Better to refuse the
        // create than to strand an unreachable document.
        const orgRef = await requireCurrentOrgId()
        const created = await clientWrite.create({
          _type: 'staff',
          name: input.name,
          role: input.role,
          link: input.link,
          ...(input.email ? { email: input.email } : {}),
          ...(input.company ? { company: input.company } : {}),
          ...(image ? { image } : {}),
          ...organizationField(orgRef),
        })
        revalidateTag('content:staff', 'default')
        return { _id: created._id }
      } catch (error) {
        if (error instanceof TRPCError) throw error
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
        // OWNERSHIP (#730): `id` is client input. Without this the patch would
        // set `name`/`role`/`email` on ANY document in the shared dataset —
        // another tenant's staff, or their `conference` document.
        await requireDocumentInCurrentOrg(id, 'staff')
        let patch = clientWrite.patch(id)
        if (Object.keys(set).length > 0) patch = patch.set(set)
        if (unset.length > 0) patch = patch.unset(unset)
        await patch.commit()
        revalidateTag('content:staff', 'default')
        return { success: true }
      } catch (error) {
        // Preserve the fail-closed refusal instead of masking it as a 500.
        if (error instanceof TRPCError) throw error
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
        // OWNERSHIP (#730): `input.id` is client input, and nothing references a
        // staff document, so an unguarded delete removed ANY unreferenced
        // document in the shared dataset — including another tenant's.
        await requireDocumentInCurrentOrg(input.id, 'staff')
        await clientWrite.delete(input.id)
        revalidateTag('content:staff', 'default')
        return { success: true }
      } catch (error) {
        // Preserve the fail-closed refusal instead of masking it as a 500.
        if (error instanceof TRPCError) throw error
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete staff member',
          cause: error,
        })
      }
    }),
})
