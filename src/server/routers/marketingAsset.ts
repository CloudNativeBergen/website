import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminProcedure, router } from '@/server/trpc'
import {
  requireCurrentOrgId,
  requireDocumentInCurrentOrg,
} from '@/server/tenancy'
import {
  deleteMarketingAssetDocument,
  listMarketingAssets,
  countMarketingAssetReleaseTwins,
  readMarketingAssetImage,
} from '@/lib/marketing-asset/sanity'
import { deleteImageAssetIfOrphaned } from '@/lib/sanity/orphaned-asset'

/**
 * The organization's marketing asset gallery (spec §3). Organizer-only through
 * `adminProcedure`, which refuses before any handler read. The organization is
 * always resolved from the request host, never taken from the client. Uploads
 * go through the move route (`/api/admin/marketing-assets`), not tRPC: tRPC
 * sets no `maxDuration` for a streamed move (spec §4.1).
 */
/** The same refusal `requireDocumentInCurrentOrg` gives a missing id. */
const notFound = () =>
  new TRPCError({
    code: 'NOT_FOUND',
    message: 'No marketingAsset with that id for this request',
  })

export const marketingAssetRouter = router({
  list: adminProcedure.query(async () =>
    listMarketingAssets(await requireCurrentOrgId()),
  ),

  delete: adminProcedure
    .input(z.object({ id: z.string().min(1).max(200) }))
    .mutation(async ({ input }) => {
      // The gallery lists published (root, dot-free) ids only. A draft
      // (`drafts.x`) or release version (`versions.r.x`) id is never one, and
      // is refused with the guard's own answer rather than deleted on its own.
      if (input.id.includes('.')) throw notFound()
      // Refuses a foreign, wrong-typed or missing id with ONE answer, before
      // the asset is read.
      const orgId = await requireDocumentInCurrentOrg(
        input.id,
        'marketingAsset',
      )
      // A Content Release in Studio holds its own copy of the asset. Deleting
      // the live one would let publishing that release bring it back, and
      // the copy would keep the image alive; deleting the copy from here
      // would silently edit someone's staged release. Refused instead: the
      // release is Studio's to change. Ownership is already proven, so this
      // answer reveals nothing about another tenant.
      if ((await countMarketingAssetReleaseTwins(orgId, input.id)) > 0)
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message:
            'This asset is part of a Content Release in Studio. Remove it from the release first, then delete it here.',
        })
      const image = await readMarketingAssetImage(orgId, input.id)
      // The documents first: while one exists, it is itself a reference to
      // the image, and the orphan check would always keep the file.
      await deleteMarketingAssetDocument(input.id)
      // Only an image this gallery's upload created is its to delete: Sanity
      // deduplicates identical bytes across tenants, so any other may be
      // another tenant's, possibly still unreferenced. A Studio draft's own
      // image is left alone for the same reason.
      if (image?.createdByUpload && image.assetId) {
        const result = await deleteImageAssetIfOrphaned(image.assetId)
        // The check fails closed: an unreadable count keeps the file. Say
        // which, so it can be retried by hand; nothing else will find it.
        if (result.remainingReferences === -1)
          console.warn(
            `Marketing asset ${input.id} deleted; its image ${result.id} was kept because its references could not be counted`,
          )
      }
      // Whether the image went is NOT answered: it would tell the caller
      // whether any tenant holds those exact bytes.
      return { deleted: true }
    }),
})
