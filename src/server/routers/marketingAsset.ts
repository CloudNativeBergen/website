import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminProcedure, router } from '@/server/trpc'
import {
  requireCurrentOrgId,
  requireDocumentInCurrentOrg,
} from '@/server/tenancy'
import { resolveConferenceId } from '@/server/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { marketingAssetDetailsSchema } from '@/lib/marketing-asset/details'
import { resolveAssetDetailsForCurrentOrg } from '@/lib/marketing-asset/guard'
import {
  deleteMarketingAssetDocument,
  listMarketingAssetFacets,
  listMarketingAssets,
  updateMarketingAssetDetails,
  countMarketingAssetReleaseTwins,
  readMarketingAssetImage,
  readMarketingAssetBackground,
} from '@/lib/marketing-asset/sanity'
import {
  backgroundRenditionUrl,
  proxiedImageUrl,
} from '@/lib/marketing-asset/background'
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

/** The asset has a staged copy in a Studio Content Release. */
const inRelease = (action: 'edit' | 'delete') =>
  new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: `This asset is part of a Content Release in Studio. Remove it from the release first, then ${action} it here.`,
  })

const assetId = z.string().min(1).max(200)

const filterSchema = z
  .object({
    editions: z.enum(['current', 'all']).optional(),
    subjectId: z.string().min(1).max(200).optional(),
    tag: z.string().max(100).optional(),
    search: z.string().max(200).optional(),
  })
  .optional()

export const marketingAssetRouter = router({
  /**
   * The gallery. "This edition" is the request host's conference, and the
   * organization the host's owner; neither is ever taken from the client.
   */
  list: adminProcedure.input(filterSchema).query(async ({ input }) => {
    const [orgId, conferenceId] = await Promise.all([
      requireCurrentOrgId(),
      resolveConferenceId(),
    ])
    return listMarketingAssets(orgId, conferenceId, input ?? {})
  }),

  /** This edition (for the edition mark) and what the filter menus offer. */
  filters: adminProcedure.query(async () => {
    const orgId = await requireCurrentOrgId()
    const [{ conference }, facets] = await Promise.all([
      getConferenceForCurrentDomain(),
      listMarketingAssetFacets(orgId),
    ])
    return {
      edition: conference
        ? { _id: conference._id, title: conference.title ?? 'This edition' }
        : null,
      ...facets,
    }
  }),

  /**
   * Change an asset's title, alt text, scope and edition mark, subject, tags
   * and credit. Any organizer of the organization may, on any of its assets,
   * including another edition's (spec §3).
   */
  update: adminProcedure
    .input(z.object({ id: assetId, details: marketingAssetDetailsSchema }))
    .mutation(async ({ input }) => {
      // Published ids only, as for delete.
      if (input.id.includes('.')) throw notFound()
      // The asset first: a foreign asset is refused before any subject or
      // edition is probed, so the answer says nothing about those either.
      const orgId = await requireDocumentInCurrentOrg(
        input.id,
        'marketingAsset',
      )
      // A staged Content Release copy would write its stale details back
      // when published, silently undoing this edit. Refused, as for delete.
      if ((await countMarketingAssetReleaseTwins(orgId, input.id)) > 0)
        throw inRelease('edit')
      const details = await resolveAssetDetailsForCurrentOrg(
        input.details,
        input.id,
      )
      await updateMarketingAssetDetails(input.id, details)
      return { updated: true }
    }),

  /**
   * One of our images as a studio scene background (studio video spec §5):
   * a same-origin proxy URL, so drawing it never taints the canvas. The id is
   * the only thing the client names, and it is proven ours before it is read.
   */
  background: adminProcedure
    .input(z.object({ id: assetId }))
    .query(async ({ input }) => {
      // Published ids only, as the gallery lists them.
      if (input.id.includes('.')) throw notFound()
      const orgId = await requireDocumentInCurrentOrg(
        input.id,
        'marketingAsset',
      )
      const asset = await readMarketingAssetBackground(orgId, input.id)
      if (!asset?.url) throw notFound()
      return {
        _id: input.id,
        title: asset.title,
        alt: asset.alt,
        url: proxiedImageUrl(
          backgroundRenditionUrl(asset.url, asset.width, asset.height),
        ),
      }
    }),

  delete: adminProcedure
    .input(z.object({ id: assetId }))
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
        throw inRelease('delete')
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
