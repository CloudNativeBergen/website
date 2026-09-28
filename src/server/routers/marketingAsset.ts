import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminProcedure, router } from '@/server/trpc'
import {
  requireCurrentOrgId,
  requireDocumentInCurrentConference,
  requireDocumentInCurrentOrg,
} from '@/server/tenancy'
import { LiveDocumentIdSchema } from '@/server/schemas/social'
import { resolveConferenceId } from '@/server/trpc'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { marketingAssetDetailsSchema } from '@/lib/marketing-asset/details'
import { resolveAssetDetailsForCurrentOrg } from '@/lib/marketing-asset/guard'
import { kindHasAlt } from '@/lib/marketing-asset/types'
import type { MarketingAssetKind } from '@/lib/marketing-asset/types'
import {
  deleteMarketingAssetDocument,
  listMarketingAssetFacets,
  listMarketingAssets,
  listMarketingAssetsForPost,
  updateMarketingAssetDetails,
  countMarketingAssetReleaseTwins,
  readMarketingAssetMedia,
  readMarketingAssetBackground,
} from '@/lib/marketing-asset/sanity'
import {
  backgroundRenditionUrl,
  proxiedImageUrl,
} from '@/lib/marketing-asset/background'
import {
  deleteFileAssetIfOrphaned,
  deleteImageAssetIfOrphaned,
} from '@/lib/sanity/orphaned-asset'
import { snapshotGallerySubjectIntoProjects } from '@/lib/video-project/sanity'

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

/** Sanity refused a compare-and-set write: the document moved on. */
function isRevisionConflict(error: unknown): boolean {
  // Only a revision mismatch: a 409 for a document still referenced (or any
  // other refusal) is not "someone saved first" and must not read as one.
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('revision')
}

/** The asset has a staged copy in a Studio Content Release. */
const inRelease = (action: 'edit' | 'delete') =>
  new TRPCError({
    code: 'PRECONDITION_FAILED',
    message: `This asset is part of a Content Release in Studio. Remove it from the release first, then ${action} it here.`,
  })

const assetId = z.string().min(1).max(200)

/** Who is refused an edit without alt text, in the refusal's words. */
const ALT_OWNER: Record<MarketingAssetKind, string> = {
  image: 'An image',
  gif: 'A GIF',
  video: 'A video',
  audio: 'A track',
}

const filterSchema = z
  .object({
    editions: z.enum(['current', 'all']).optional(),
    kind: z.enum(['image', 'gif', 'video', 'audio']).optional(),
    subjectId: z.string().min(1).max(200).optional(),
    tag: z.string().max(100).optional(),
    search: z.string().max(200).optional(),
    /** Count "used in N posts" (the Assets page); off for every other reader. */
    usage: z.boolean().optional(),
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
    const { usage, ...filter } = input ?? {}
    return listMarketingAssets(orgId, conferenceId, filter, {
      countUsage: usage === true,
    })
  }),

  /**
   * The post editor's "Marketing assets" picker (spec §5): the post's subject
   * first, then this edition's, then the organization's. The post is proven
   * this conference's before anything is read; its subject comes from the
   * post's Task on the server.
   */
  forPost: adminProcedure
    .input(
      z.object({
        postId: LiveDocumentIdSchema,
        editions: z.enum(['current', 'all']).optional(),
        search: z.string().max(200).optional(),
      }),
    )
    .query(async ({ input }) => {
      const conferenceId = await requireDocumentInCurrentConference(
        input.postId,
        'socialPost',
      )
      const orgId = await requireCurrentOrgId()
      return listMarketingAssetsForPost(orgId, conferenceId, input.postId, {
        editions: input.editions,
        search: input.search,
      })
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
      // An image, GIF or video keeps its required alt text; an audio track
      // never has any.
      const media = await readMarketingAssetMedia(orgId, input.id)
      if (!media) throw notFound()
      const { alt, ...rest } = input.details
      if (kindHasAlt(media.kind) && !alt)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${ALT_OWNER[media.kind]} needs its alt text.`,
        })
      const details = await resolveAssetDetailsForCurrentOrg(
        { ...rest, alt: kindHasAlt(media.kind) ? alt : undefined },
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
      const media = await readMarketingAssetMedia(orgId, input.id)
      // A saved video holding this file keeps it past the asset, and with it
      // the asset's subject as it is NOW — the record erasure follows (#1181).
      // Compare-and-set throughout: a project saved, or the asset's subject
      // changed, while this runs fails the delete — try again — rather than
      // leaving a project with a stale subject.
      const changed = () =>
        new TRPCError({
          code: 'CONFLICT',
          message:
            'This asset or a video using it changed while it was being deleted. Try again.',
        })
      let assetRev: string | null
      try {
        const snapshot = await snapshotGallerySubjectIntoProjects(
          orgId,
          input.id,
        )
        if (snapshot.releaseHolders > 0)
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'A video in a Content Release in Studio uses this asset. Remove it from the release first, then delete the asset here.',
          })
        assetRev = snapshot.assetRev
      } catch (error) {
        if (isRevisionConflict(error)) throw changed()
        throw error
      }
      // The documents first: while one exists, it is itself a reference to
      // the file, and the orphan check would always keep it.
      try {
        await deleteMarketingAssetDocument(input.id, assetRev ?? undefined)
      } catch (error) {
        if (isRevisionConflict(error)) throw changed()
        throw error
      }
      // Only a file this gallery's upload created is its to delete — an
      // image, a GIF, a track, a video's MP4 and its poster, each on its own:
      // Sanity deduplicates identical bytes across tenants, so any other may
      // be another tenant's, possibly still unreferenced. A Studio draft's
      // own file is left alone for the same reason.
      for (const file of media?.files ?? []) {
        if (!file.createdByUpload) continue
        const result = await (
          file.type === 'file'
            ? deleteFileAssetIfOrphaned
            : deleteImageAssetIfOrphaned
        )(file.assetId)
        // The check fails closed: an unreadable count keeps the file. Say
        // which, so it can be retried by hand; nothing else will find it.
        if (result.remainingReferences === -1)
          console.warn(
            `Marketing asset ${input.id} deleted; its file ${result.id} was kept because its references could not be counted`,
          )
      }
      // Whether the image went is NOT answered: it would tell the caller
      // whether any tenant holds those exact bytes.
      return { deleted: true }
    }),
})
