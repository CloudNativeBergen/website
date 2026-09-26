import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { getCurrentDateTime } from '@/lib/time'
import { OPEN_PROJECTION, VIDEO_PROJECT_FORMAT_VERSION } from './document'
import type { ProjectRow } from './document'
import type { ProjectRights, VideoProjectRow } from './format'

/**
 * `videoProject` reads and writes (docs/MARKETING_STUDIO_VIDEO_SPEC.md §7).
 * Every read is scoped to ONE organization with the organization filter, and
 * reads published documents only. Callers prove a client-supplied id this
 * organization's with the tenancy guard BEFORE any of these runs.
 */

const opts = { cache: 'no-store' } as const

/** The organization's projects, most recently saved first. */
export async function listVideoProjects(
  orgId: string,
): Promise<VideoProjectRow[]> {
  const rows = await scopedFetch<VideoProjectRow[] | null>(
    clientReadUncached,
    { orgId },
    `*[_type == "videoProject" && _id in path("*")] | order(coalesce(updatedAt, _updatedAt) desc) {
      _id,
      "title": coalesce(title, ""),
      "scope": coalesce(scope, "organization"),
      "edition": select(scope == "edition" => conference->title, null),
      "updatedAt": coalesce(updatedAt, _updatedAt),
      "scenes": count(scenes)
    }`,
    {},
    opts,
  )
  return rows ?? []
}

/** One of the organization's projects, as the studio opens it. */
export async function readVideoProject(
  orgId: string,
  id: string,
): Promise<ProjectRow | null> {
  return scopedFetch<ProjectRow | null>(
    clientReadUncached,
    { orgId },
    `*[_type == "videoProject" && _id == $id][0]${OPEN_PROJECTION}`,
    { id },
    opts,
  )
}

/** A file a stored project holds, and what the save that stored it knew. */
export interface StoredFile {
  fileId: string
  galleryAssetId: string | null
  createdByGallery: boolean | null
  subjectId: string | null
}

/** What a save checks against, as {@link readVideoProjectFiles} reads it. */
export type StoredProjectFiles = {
  _rev: string
  formatVersion: unknown
  scope: 'organization' | 'edition' | null
  conferenceId: string | null
  images: StoredFile[]
  track:
    | (StoredFile & {
        title: string | null
        rights: ProjectRights | null
      })
    | null
}

/**
 * What a save checks against: the revision, and the files the project
 * already holds — the only files a client may name by file id.
 */
export async function readVideoProjectFiles(
  orgId: string,
  id: string,
): Promise<StoredProjectFiles | null> {
  return scopedFetch(
    clientReadUncached,
    { orgId },
    `*[_type == "videoProject" && _id == $id][0]{
      _rev,
      formatVersion,
      scope,
      "conferenceId": conference._ref,
      "images": coalesce(scenes[defined(background.image.asset._ref)]{
        "fileId": background.image.asset._ref,
        "galleryAssetId": background.image.galleryAsset._ref,
        "createdByGallery": background.image.createdByGallery,
        "subjectId": background.image.subject._ref
      }, []),
      "track": select(defined(track.file.asset._ref) => {
        "fileId": track.file.asset._ref,
        "galleryAssetId": track.file.galleryAsset._ref,
        "createdByGallery": track.file.createdByGallery,
        "subjectId": track.file.subject._ref,
        "title": track.title,
        "rights": select(defined(track.rightsConfirmation.confirmedAt) => {
          "confirmedBy": track.rightsConfirmation.confirmedBy._ref,
          "confirmedAt": track.rightsConfirmation.confirmedAt
        }, null)
      }, null)
    }`,
    { id },
    opts,
  )
}

/** A gallery asset as a project would hold its file. */
export interface GalleryFile {
  _id: string
  kind: 'image' | 'audio'
  title: string
  fileId: string | null
  createdByUpload: boolean
  subjectId: string | null
  rights: ProjectRights | null
}

/**
 * The files of the named gallery assets that are THIS organization's —
 * published ones only. An id of another organization's asset, or of none,
 * is simply absent from the answer.
 */
export async function readGalleryFiles(
  orgId: string,
  ids: string[],
): Promise<GalleryFile[]> {
  if (ids.length === 0) return []
  const rows = await scopedFetch<GalleryFile[] | null>(
    clientReadUncached,
    { orgId },
    `*[_type == "marketingAsset" && _id in $ids && _id in path("*")]{
      _id,
      "kind": coalesce(kind, "image"),
      "title": coalesce(title, ""),
      "subjectId": subject._ref,
      "fileId": select(kind == "audio" => audio.asset._ref, image.asset._ref),
      "createdByUpload": select(kind == "audio" => createdFileAssetId, createdImageAssetId) == select(kind == "audio" => audio.asset._ref, image.asset._ref),
      "rights": select(defined(rightsConfirmation.confirmedAt) => {
        "confirmedBy": rightsConfirmation.confirmedBy._ref,
        "confirmedAt": rightsConfirmation.confirmedAt
      }, null)
    }`,
    { ids },
    opts,
  )
  return rows ?? []
}

/** The whole stored project, for Duplicate. */
export async function readVideoProjectDocument(
  orgId: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  return scopedFetch(
    clientReadUncached,
    { orgId },
    `*[_type == "videoProject" && _id == $id][0]`,
    { id },
    opts,
  )
}

export interface NewVideoProject {
  orgId: string
  title: string
  mark: { scope: 'organization' } | { scope: 'edition'; conferenceId: string }
  scenes: Record<string, unknown>[]
  track?: Record<string, unknown>
}

/** Create a project in the caller's organization. */
export async function createVideoProject(
  input: NewVideoProject,
): Promise<{ _id: string; _rev: string }> {
  const created = await clientWrite.create({
    _type: 'videoProject',
    organization: { _type: 'reference', _ref: input.orgId },
    scope: input.mark.scope,
    ...(input.mark.scope === 'edition'
      ? { conference: { _type: 'reference', _ref: input.mark.conferenceId } }
      : {}),
    title: input.title,
    formatVersion: VIDEO_PROJECT_FORMAT_VERSION,
    scenes: input.scenes,
    ...(input.track ? { track: input.track } : {}),
    updatedAt: getCurrentDateTime(),
  })
  return { _id: created._id, _rev: created._rev }
}

/**
 * Save over a project, compare-and-set on the revision the editor loaded.
 * The scenes go in ONE `set` of the whole array. `track: undefined` leaves
 * the stored track alone; `null` removes it. Returns the new revision, or
 * null when someone else saved first.
 */
export async function saveVideoProject(
  id: string,
  rev: string,
  fields: {
    title: string
    scenes: Record<string, unknown>[]
    track?: Record<string, unknown> | null
  },
): Promise<string | null> {
  const set: Record<string, unknown> = {
    title: fields.title,
    formatVersion: VIDEO_PROJECT_FORMAT_VERSION,
    scenes: fields.scenes,
    updatedAt: getCurrentDateTime(),
  }
  if (fields.track) set.track = fields.track
  let patch = clientWrite.patch(id).ifRevisionId(rev).set(set)
  if (fields.track === null) patch = patch.unset(['track'])
  try {
    const saved = await patch.commit()
    return saved._rev
  } catch (error) {
    if (isRevisionConflict(error)) return null
    throw error
  }
}

function isRevisionConflict(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode
  if (statusCode === 409) return true
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('revision') && message.includes('mismatch')
}

/**
 * The files a project's gallery uploads created, read BEFORE it is deleted:
 * afterwards nothing records them.
 */
export async function readVideoProjectCreatedFiles(
  orgId: string,
  id: string,
): Promise<string[]> {
  const row = await scopedFetch<{ ids: (string | null)[] | null } | null>(
    clientReadUncached,
    { orgId },
    `*[_type == "videoProject" && _id == $id][0]{
      "ids": scenes[background.image.createdByGallery == true].background.image.asset._ref
        + select(track.file.createdByGallery == true => [track.file.asset._ref], [])
    }`,
    { id },
    opts,
  )
  return [
    ...new Set(
      (row?.ids ?? []).filter((x): x is string => typeof x === 'string'),
    ),
  ]
}

/**
 * How many Content Release versions (`versions.<release>.<id>`) of one of this
 * organization's projects exist, counted at an API version whose `raw`
 * perspective sees them (as for gallery assets).
 */
export async function countVideoProjectReleaseTwins(
  orgId: string,
  id: string,
): Promise<number> {
  const result = await scopedFetch<{ n: number } | null>(
    clientReadUncached.withConfig({
      apiVersion: '2025-02-19',
      perspective: 'raw',
    }),
    { orgId },
    `{ "n": count(*[_type == "videoProject" && _id in path("versions.*." + $id)]) }`,
    { id },
    opts,
  )
  return result?.n ?? 0
}

/** Delete a project and any Studio draft of it, together. */
export async function deleteVideoProjectDocument(id: string): Promise<void> {
  await clientWrite.transaction().delete(id).delete(`drafts.${id}`).commit()
}
