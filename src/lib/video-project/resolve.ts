import 'server-only'
import { TRPCError } from '@trpc/server'
import { unkeptBackgroundRefusal } from './format'
import type { ProjectSceneInput, ProjectTrackInput } from './format'
import type { ResolvedFile, ResolvedTrack } from './document'
import {
  readGalleryFiles,
  type GalleryFile,
  type StoredFile,
  type StoredProjectFiles,
} from './sanity'

/** A file the project already holds, as the next write holds it. */
function fromStored(f: StoredFile): ResolvedFile {
  return {
    fileId: f.fileId,
    ...(f.galleryAssetId ? { galleryAssetId: f.galleryAssetId } : {}),
    createdByGallery: f.createdByGallery === true,
    ...(f.subjectId ? { subjectId: f.subjectId } : {}),
  }
}

/** A gallery asset's file, as a project holds it. */
function fromGallery(row: GalleryFile & { fileId: string }): ResolvedFile {
  return {
    fileId: row.fileId,
    galleryAssetId: row._id,
    createdByGallery: row.createdByUpload,
    ...(row.subjectId ? { subjectId: row.subjectId } : {}),
  }
}

const refuse = (message: string) =>
  new TRPCError({ code: 'BAD_REQUEST', message })

/**
 * Every file a write names, resolved and proven this organization's: a file
 * the project ALREADY holds (by file id), or else a published gallery asset
 * of this organization (by asset id). Anything else — a background uploaded
 * and not kept, another organization's asset, one since deleted — is
 * refused, naming the scenes, before anything is written.
 */
export async function resolveProjectFiles(
  orgId: string,
  scenes: ProjectSceneInput[],
  track: ProjectTrackInput | null | undefined,
  stored: Pick<StoredProjectFiles, 'images' | 'track'> | null,
): Promise<{ images: (ResolvedFile | null)[]; track: ResolvedTrack | null }> {
  // Keyed by file AND gallery entry: two entries can share one deduplicated
  // file, and each scene keeps the entry (and subject) it names. The file
  // alone decides only when the scene names no entry, or one that no longer
  // resolves — never over a live, different entry.
  const heldKey = (fileId: string, galleryAssetId?: string | null) =>
    `${fileId}\u0000${galleryAssetId ?? ''}`
  const heldExact = new Map(
    (stored?.images ?? []).map((f) => [heldKey(f.fileId, f.galleryAssetId), f]),
  )
  const heldAny = new Map((stored?.images ?? []).map((f) => [f.fileId, f]))
  const heldExactly = (fileId?: string, galleryAssetId?: string) =>
    fileId ? heldExact.get(heldKey(fileId, galleryAssetId)) : undefined
  // As for images: the entry the track names decides; the file alone only
  // when no entry is named, or it no longer resolves.
  const trackHeld =
    track?.fileId && stored?.track?.fileId === track.fileId
      ? stored.track
      : null
  const heldTrackExactly =
    trackHeld &&
    (trackHeld.galleryAssetId ?? undefined) === track?.galleryAssetId
      ? trackHeld
      : null

  const wanted = new Set<string>()
  for (const scene of scenes) {
    const image = scene.design.background.image
    if (
      image?.galleryAssetId &&
      !heldExactly(image.fileId, image.galleryAssetId)
    )
      wanted.add(image.galleryAssetId)
  }
  if (track?.galleryAssetId && !heldTrackExactly)
    wanted.add(track.galleryAssetId)
  const gallery = new Map(
    (await readGalleryFiles(orgId, [...wanted])).map((row) => [row._id, row]),
  )
  const galleryFile = (id: string | undefined, kind: GalleryFile['kind']) => {
    const row = id ? gallery.get(id) : undefined
    return row?.kind === kind && row.fileId
      ? (row as GalleryFile & { fileId: string })
      : null
  }

  const unkept: number[] = []
  const images = scenes.map((scene, i): ResolvedFile | null => {
    const image = scene.design.background.image
    if (!image) return null
    const exact = heldExactly(image.fileId, image.galleryAssetId)
    if (exact) return fromStored(exact)
    const row = galleryFile(image.galleryAssetId, 'image')
    if (row) return fromGallery(row)
    // No entry named, or it is gone: the file the project holds, as held.
    const anyHeld = image.fileId ? heldAny.get(image.fileId) : undefined
    if (anyHeld) return fromStored(anyHeld)
    unkept.push(i + 1)
    return null
  })
  if (unkept.length > 0) throw refuse(unkeptBackgroundRefusal(unkept))

  if (!track) return { images, track: null }
  const row = heldTrackExactly
    ? null
    : galleryFile(track.galleryAssetId, 'audio')
  const heldTrack = heldTrackExactly ?? (row ? null : trackHeld)
  if (heldTrack)
    return {
      images,
      track: {
        ...fromStored(heldTrack),
        title: heldTrack.title ?? '',
        rights: heldTrack.rights,
      },
    }
  if (!row)
    throw refuse(
      'The music track is not in the gallery, so the project cannot be saved. Choose a track from the gallery, then save.',
    )
  // Every gallery track carries one; a Studio-made one without it is not a
  // track anyone confirmed the right to use.
  if (!row.rights)
    throw refuse(
      'That track has no rights confirmation. Upload it through the gallery, confirming you may use it, then save.',
    )
  return {
    images,
    track: { ...fromGallery(row), title: row.title, rights: row.rights },
  }
}
