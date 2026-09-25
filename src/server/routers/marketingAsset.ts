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
  readMarketingAssetImageIds,
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
      // The gallery lists published ids only; a draft id is never one, and is
      // refused with the guard's own answer rather than deleted on its own.
      if (input.id.startsWith('drafts.')) throw notFound()
      // Refuses a foreign, wrong-typed or missing id with ONE answer, before
      // the asset is read.
      const orgId = await requireDocumentInCurrentOrg(
        input.id,
        'marketingAsset',
      )
      const imageIds = await readMarketingAssetImageIds(orgId, input.id)
      // The documents first: while one exists, it is itself a reference to
      // the image, and the orphan check would always keep the file.
      await deleteMarketingAssetDocument(input.id)
      const images = await Promise.all(
        imageIds.map((imageId) => deleteImageAssetIfOrphaned(imageId)),
      )
      return {
        deleted: true,
        imageDeleted: images.length > 0 && images.every((i) => i.deleted),
      }
    }),
})
