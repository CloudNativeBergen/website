import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminProcedure, resolveConferenceId, router } from '@/server/trpc'
import {
  requireCurrentOrgId,
  requireDocumentInCurrentOrg,
} from '@/server/tenancy'
import {
  PROJECT_CONFLICT_MESSAGE,
  copyTitle,
  projectFormatRefusal,
  projectScenesSchema,
  projectTitleSchema,
  projectTrackInputSchema,
  unkeptBackgroundRefusal,
  type ProjectSceneInput,
  type ProjectTrackInput,
} from '@/lib/video-project/format'
import {
  ProjectFormatError,
  duplicateContents,
  openedProject,
  storedScenes,
  storedTrack,
  type ResolvedFile,
  type ResolvedTrack,
} from '@/lib/video-project/document'
import {
  countVideoProjectReleaseTwins,
  createVideoProject,
  deleteVideoProjectDocument,
  listVideoProjects,
  readGalleryFiles,
  readVideoProject,
  readVideoProjectCreatedFiles,
  readVideoProjectDocument,
  readVideoProjectFiles,
  saveVideoProject,
  type StoredFile,
} from '@/lib/video-project/sanity'
import {
  backgroundRenditionUrl,
  proxiedImageUrl,
} from '@/lib/marketing-asset/background'
import {
  deleteFileAssetIfOrphaned,
  deleteImageAssetIfOrphaned,
} from '@/lib/sanity/orphaned-asset'

/**
 * Saved studio videos (docs/MARKETING_STUDIO_VIDEO_SPEC.md §7). Organizer-only
 * through `adminProcedure`; the organization is always the request host's.
 * Every procedure that takes a project id proves it this organization's with
 * the tenancy guard BEFORE anything of the project is read, so another
 * organization's id and a nonexistent one get the same answer, and nothing is
 * fetched for either.
 */

/** The same refusal `requireDocumentInCurrentOrg` gives a missing id. */
const notFound = () =>
  new TRPCError({
    code: 'NOT_FOUND',
    message: 'No videoProject with that id for this request',
  })

const projectId = z
  .string()
  .min(1)
  .max(200)
  // Published ids only: a Studio draft or release copy is never a project.
  .refine((id) => !id.includes('.'), 'Not a published document id')

/** Prove the id this organization's project, before anything is read. */
async function guard(id: string): Promise<string> {
  return requireDocumentInCurrentOrg(id, 'videoProject')
}

const refuseFormat = (message: string) =>
  new TRPCError({ code: 'PRECONDITION_FAILED', message })

/**
 * A Content Release in Studio holds its own copy of the project: publishing
 * it would silently undo this save, or bring a deleted project back. The
 * release is Studio's to change; refused, as for gallery assets.
 */
async function refuseIfInRelease(
  orgId: string,
  id: string,
  action: 'save' | 'delete',
) {
  if ((await countVideoProjectReleaseTwins(orgId, id)) > 0)
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: `This project is part of a Content Release in Studio. Remove it from the release first, then ${action} it here.`,
    })
}

/**
 * Files a gallery upload created that a project no longer holds go through
 * the orphan check: deleted only once nothing references them. Never throws —
 * the write is already done.
 */
async function releaseFiles(projectId: string, ids: string[]) {
  for (const id of new Set(ids)) {
    const result = await (
      id.startsWith('file-')
        ? deleteFileAssetIfOrphaned
        : deleteImageAssetIfOrphaned
    )(id).catch(() => null)
    if (!result || result.remainingReferences === -1)
      console.warn(
        `Video project ${projectId} let go of file ${id}; it was kept because its references could not be counted`,
      )
  }
}

/**
 * Every file a save names, resolved and proven this organization's: a file
 * the project ALREADY holds (by file id), or else a gallery asset of this
 * organization (by asset id). Anything else — a background uploaded and not
 * kept, another organization's asset, one since deleted — is refused, naming
 * the scenes, before anything is written.
 */
async function resolveProjectFiles(
  orgId: string,
  scenes: ProjectSceneInput[],
  track: ProjectTrackInput | null | undefined,
  stored: { images: StoredFile[]; track: ResolvedTrackStored | null } | null,
): Promise<{ images: (ResolvedFile | null)[]; track: ResolvedTrack | null }> {
  const held = new Map((stored?.images ?? []).map((f) => [f.fileId, f]))
  const fromStored = (f: StoredFile): ResolvedFile => ({
    fileId: f.fileId,
    ...(f.galleryAssetId ? { galleryAssetId: f.galleryAssetId } : {}),
    createdByGallery: f.createdByGallery === true,
    ...(f.subjectId ? { subjectId: f.subjectId } : {}),
  })
  const storedTrackFile =
    track?.fileId && stored?.track?.fileId === track.fileId
      ? stored.track
      : null

  const wanted = new Set<string>()
  for (const scene of scenes) {
    const image = scene.design.background.image
    if (
      image &&
      !(image.fileId && held.has(image.fileId)) &&
      image.galleryAssetId
    )
      wanted.add(image.galleryAssetId)
  }
  if (track && !storedTrackFile && track.galleryAssetId)
    wanted.add(track.galleryAssetId)
  const gallery = new Map(
    (await readGalleryFiles(orgId, [...wanted])).map((row) => [row._id, row]),
  )

  const unkept: number[] = []
  const images = scenes.map((scene, i): ResolvedFile | null => {
    const image = scene.design.background.image
    if (!image) return null
    const kept = image.fileId ? held.get(image.fileId) : undefined
    if (kept) return fromStored(kept)
    const row = image.galleryAssetId ? gallery.get(image.galleryAssetId) : null
    if (row?.kind === 'image' && row.fileId)
      return {
        fileId: row.fileId,
        galleryAssetId: row._id,
        createdByGallery: row.createdByUpload,
        ...(row.subjectId ? { subjectId: row.subjectId } : {}),
      }
    unkept.push(i + 1)
    return null
  })
  if (unkept.length > 0)
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: unkeptBackgroundRefusal(unkept),
    })

  let resolvedTrack: ResolvedTrack | null = null
  if (track) {
    if (storedTrackFile) {
      resolvedTrack = {
        ...fromStored(storedTrackFile),
        title: storedTrackFile.title ?? '',
        rights: storedTrackFile.rights,
      }
    } else {
      const row = track.galleryAssetId
        ? gallery.get(track.galleryAssetId)
        : null
      if (row?.kind !== 'audio' || !row.fileId)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'The music track is not in the gallery, so the project cannot be saved. Choose a track from the gallery, then save.',
        })
      // Every gallery track carries one; a Studio-made one without it is
      // not a track anyone confirmed the right to use.
      if (!row.rights)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'That track has no rights confirmation. Upload it through the gallery, confirming you may use it, then save.',
        })
      resolvedTrack = {
        fileId: row.fileId,
        galleryAssetId: row._id,
        createdByGallery: row.createdByUpload,
        ...(row.subjectId ? { subjectId: row.subjectId } : {}),
        title: row.title,
        rights: row.rights,
      }
    }
  }
  return { images, track: resolvedTrack }
}

type ResolvedTrackStored = NonNullable<
  NonNullable<Awaited<ReturnType<typeof readVideoProjectFiles>>>['track']
>

/** Which file each scene now holds, for the editor to carry into later saves. */
const sceneFiles = (
  scenes: ProjectSceneInput[],
  images: (ResolvedFile | null)[],
) => scenes.map((s, i) => ({ key: s.key, fileId: images[i]?.fileId ?? null }))

const contentsSchema = {
  title: projectTitleSchema,
  scenes: projectScenesSchema,
  /** Undefined leaves a stored track alone; null removes it. */
  track: projectTrackInputSchema.nullish(),
}

export const videoProjectRouter = router({
  /** The organization's projects. */
  list: adminProcedure.query(async () => {
    return listVideoProjects(await requireCurrentOrgId())
  }),

  /** One project, as the studio opens it — or why it cannot be. */
  open: adminProcedure
    .input(z.object({ id: projectId }))
    .query(async ({ input }) => {
      const orgId = await guard(input.id)
      const row = await readVideoProject(orgId, input.id)
      if (!row) throw notFound()
      try {
        return openedProject(row, (url, width, height) =>
          proxiedImageUrl(backgroundRenditionUrl(url, width, height)),
        )
      } catch (error) {
        if (error instanceof ProjectFormatError)
          throw refuseFormat(error.message)
        throw error
      }
    }),

  /**
   * A new project in this organization: organization-wide, or for the
   * request host's edition — never an edition the client names.
   */
  create: adminProcedure
    .input(
      z.object({
        ...contentsSchema,
        edition: z.enum(['none', 'current']).default('none'),
        /**
         * Saving as a new project (after a conflict): the new one may hold
         * the files this project of ours already holds, as a save over it
         * could — proven ours by the guard before it is read.
         */
        copyFilesFrom: projectId.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // The source is proven ours before it is read. One since deleted — or
      // never ours — lends nothing: the project is then created as any new
      // one, so a conflict's recovery still saves what it can, and a
      // background only the source held is refused as not kept.
      let orgId: string
      let source: Awaited<ReturnType<typeof readVideoProjectFiles>> = null
      if (input.copyFilesFrom) {
        try {
          orgId = await guard(input.copyFilesFrom)
          source = await readVideoProjectFiles(orgId, input.copyFilesFrom)
        } catch (error) {
          if (!(error instanceof TRPCError && error.code === 'NOT_FOUND'))
            throw error
          orgId = await requireCurrentOrgId()
        }
      } else orgId = await requireCurrentOrgId()
      const files = await resolveProjectFiles(
        orgId,
        input.scenes,
        input.track,
        source,
      )
      // A copy keeps its source's edition, re-checked as ours: Studio could
      // have pointed it anywhere.
      const sourceEdition =
        source?.scope === 'edition' && source.conferenceId
          ? source.conferenceId
          : null
      if (sourceEdition)
        await requireDocumentInCurrentOrg(sourceEdition, 'conference')
      const created = await createVideoProject({
        orgId,
        title: input.title,
        mark: sourceEdition
          ? { scope: 'edition', conferenceId: sourceEdition }
          : source
            ? { scope: 'organization' }
            : input.edition === 'current'
              ? { scope: 'edition', conferenceId: await resolveConferenceId() }
              : { scope: 'organization' },
        scenes: storedScenes(input.scenes, files.images),
        // No track sent: the source's, as it is stored (the editor has no
        // music yet, #1179) — as Duplicate carries it.
        ...(input.track && files.track
          ? { track: storedTrack(input.track, files.track) }
          : input.track === undefined && source?.storedTrack
            ? { track: source.storedTrack }
            : {}),
      })
      return { ...created, scenes: sceneFiles(input.scenes, files.images) }
    }),

  /**
   * Save over a project, compare-and-set on the revision the editor loaded:
   * a save over someone else's newer one is refused as a conflict. The new
   * revision comes back for the next save.
   */
  save: adminProcedure
    .input(
      z.object({
        id: projectId,
        rev: z.string().min(1).max(100),
        ...contentsSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const orgId = await guard(input.id)
      const stored = await readVideoProjectFiles(orgId, input.id)
      if (!stored) throw notFound()
      // A project another version wrote is never overwritten in this one.
      const refusal = projectFormatRefusal(stored.formatVersion)
      if (refusal) throw refuseFormat(refusal)
      if (stored._rev !== input.rev)
        throw new TRPCError({
          code: 'CONFLICT',
          message: PROJECT_CONFLICT_MESSAGE,
        })
      await refuseIfInRelease(orgId, input.id, 'save')
      const files = await resolveProjectFiles(
        orgId,
        input.scenes,
        input.track,
        stored,
      )
      const rev = await saveVideoProject(input.id, input.rev, {
        title: input.title,
        scenes: storedScenes(input.scenes, files.images),
        ...(input.track === undefined
          ? {}
          : {
              track:
                input.track && files.track
                  ? storedTrack(input.track, files.track)
                  : null,
            }),
      })
      if (!rev)
        throw new TRPCError({
          code: 'CONFLICT',
          message: PROJECT_CONFLICT_MESSAGE,
        })
      // A gallery-made file this save let go of may now be held by nothing.
      const kept = new Set([
        ...files.images.flatMap((f) => (f ? [f.fileId] : [])),
        ...(files.track ? [files.track.fileId] : []),
      ])
      await releaseFiles(input.id, [
        ...stored.images
          .filter((f) => f.createdByGallery && !kept.has(f.fileId))
          .map((f) => f.fileId),
        ...(input.track !== undefined &&
        stored.track?.createdByGallery &&
        !kept.has(stored.track.fileId)
          ? [stored.track.fileId]
          : []),
      ])
      return { _rev: rev, scenes: sceneFiles(input.scenes, files.images) }
    }),

  /**
   * A new project from another's contents: fresh keys, "Copy of" in the
   * title, the same scope, and nothing shared with the source.
   */
  duplicate: adminProcedure
    .input(z.object({ id: projectId }))
    .mutation(async ({ input }) => {
      const orgId = await guard(input.id)
      const source = await readVideoProjectDocument(orgId, input.id)
      if (!source) throw notFound()
      const refusal = projectFormatRefusal(source.formatVersion)
      if (refusal) throw refuseFormat(refusal)
      const conferenceId =
        source.scope === 'edition'
          ? (source.conference as { _ref?: unknown } | undefined)?._ref
          : undefined
      // Studio, which no guard reaches, could have pointed it anywhere.
      if (typeof conferenceId === 'string')
        await requireDocumentInCurrentOrg(conferenceId, 'conference')
      const { scenes, track } = duplicateContents(source)
      const created = await createVideoProject({
        orgId,
        title: copyTitle(typeof source.title === 'string' ? source.title : ''),
        mark:
          typeof conferenceId === 'string'
            ? { scope: 'edition', conferenceId }
            : { scope: 'organization' },
        scenes,
        ...(track ? { track } : {}),
      })
      return { _id: created._id }
    }),

  /**
   * Delete a project. A file the gallery's upload created, and that the
   * gallery asset no longer holds, goes through the orphan check: kept while
   * anything references it.
   */
  delete: adminProcedure
    .input(z.object({ id: projectId }))
    .mutation(async ({ input }) => {
      const orgId = await guard(input.id)
      await refuseIfInRelease(orgId, input.id, 'delete')
      const files = await readVideoProjectCreatedFiles(orgId, input.id)
      await deleteVideoProjectDocument(input.id)
      await releaseFiles(input.id, files)
      return { deleted: true }
    }),
})
