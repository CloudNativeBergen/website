import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { scopedFetch } from '@/lib/sanity/scoped'
import { getCurrentDateTime } from '@/lib/time'
import { OPEN_PROJECTION, VIDEO_PROJECT_FORMAT_VERSION } from './document'
import type { ProjectRow } from './document'
import { PROJECT_KEY } from './format'
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
      "edition": select(scope == "edition" && conference->organization._ref == organization._ref => conference->title, null),
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
  // Only a revision mismatch: a 409 for a document still referenced (or any
  // other refusal) is not "someone saved first" and must not read as one.
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('revision')
}

/**
 * The files a project's gallery uploads created, read BEFORE it is deleted:
 * afterwards nothing records them.
 */
export async function readVideoProjectCreatedFiles(
  orgId: string,
  id: string,
): Promise<string[]> {
  // The Studio draft too: it is deleted with the project, and may hold an
  // older file the published document no longer does.
  const rows = await scopedFetch<{ ids: (string | null)[] | null }[] | null>(
    clientReadUncached.withConfig({ perspective: 'raw' }),
    { orgId },
    `*[_type == "videoProject" && _id in [$id, "drafts." + $id]]{
      "ids": coalesce(scenes[background.image.createdByGallery == true].background.image.asset._ref, [])
        + select(track.file.createdByGallery == true => [track.file.asset._ref], [])
    }`,
    { id },
    opts,
  )
  return [
    ...new Set(
      (rows ?? [])
        .flatMap((row) => row.ids ?? [])
        .filter((x): x is string => typeof x === 'string'),
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
): Promise<{ releases: number; draft: boolean }> {
  const releases = await scopedFetch<{ n: number } | null>(
    clientReadUncached.withConfig({
      apiVersion: '2025-02-19',
      perspective: 'raw',
    }),
    { orgId },
    `{ "n": count(*[_type == "videoProject" && _id in path("versions.*." + $id)]) }`,
    { id },
    opts,
  )
  const drafts = await scopedFetch<{ n: number } | null>(
    clientReadUncached.withConfig({
      apiVersion: '2025-02-19',
      perspective: 'raw',
    }),
    { orgId },
    `{ "n": count(*[_type == "videoProject" && _id == "drafts." + $id]) }`,
    { id },
    opts,
  )
  return { releases: releases?.n ?? 0, draft: (drafts?.n ?? 0) > 0 }
}

/** Delete a project and any Studio draft of it, together. */
export async function deleteVideoProjectDocument(id: string): Promise<void> {
  await clientWrite.transaction().delete(id).delete(`drafts.${id}`).commit()
}

/**
 * Before a gallery asset is deleted, write its CURRENT subject into every
 * project (and Studio draft) of the organization holding its file through
 * it: from then on that copy is the only record of who the file shows, so a
 * subject corrected in the gallery since the project was saved must not be
 * lost to a stale one. No subject now removes the copy.
 *
 * Race-safe: each project is patched compare-and-set on the revision read
 * here (a save in between fails the patch, and the delete with it), and the
 * asset's revision is returned for the delete to be compare-and-set on too —
 * a subject changed meanwhile fails the delete rather than leaving projects
 * with the old one. A holder in a Content Release is refused: the release
 * is Studio's, and this client cannot write it.
 */
export async function snapshotGallerySubjectIntoProjects(
  orgId: string,
  assetId: string,
): Promise<{ assetRev: string | null; releaseHolders: number }> {
  const raw = clientReadUncached.withConfig({
    apiVersion: '2025-02-19',
    perspective: 'raw',
  })
  const asset = await scopedFetch<{
    subjectId: string | null
    _rev: string
  } | null>(
    raw,
    { orgId },
    `*[_type == "marketingAsset" && _id == $assetId][0]{ _rev, "subjectId": subject._ref }`,
    { assetId },
    opts,
  )
  const holders = await scopedFetch<
    | {
        _id: string
        _rev: string
        scenes: { key: string | null; subjectId: string | null }[] | null
        track: { subjectId: string | null } | null
      }[]
    | null
  >(
    raw,
    { orgId },
    `*[_type == "videoProject" && (count(scenes[background.image.galleryAsset._ref == $assetId]) > 0 || track.file.galleryAsset._ref == $assetId)]{
      _id,
      _rev,
      "scenes": scenes[background.image.galleryAsset._ref == $assetId]{ "key": _key, "subjectId": background.image.subject._ref },
      "track": select(track.file.galleryAsset._ref == $assetId => { "subjectId": track.file.subject._ref }, null)
    }`,
    { assetId },
    opts,
  )
  const releaseHolders = (holders ?? []).filter((h) =>
    h._id.startsWith('versions.'),
  ).length
  if (releaseHolders > 0) return { assetRev: null, releaseHolders }
  const subjectId = asset?.subjectId ?? null
  const tx = clientWrite.transaction()
  let writes = 0
  for (const holder of holders ?? []) {
    // Only where the copy differs: an unchanged one is left alone, so the
    // project's revision — and an open editor's next save — is untouched.
    const stale = (stored: string | null) => (stored ?? null) !== subjectId
    const paths = [
      ...(holder.scenes ?? [])
        .filter(
          (scene): scene is { key: string; subjectId: string | null } =>
            typeof scene.key === 'string' &&
            PROJECT_KEY.test(scene.key) &&
            stale(scene.subjectId),
        )
        .map(
          (scene) => `scenes[_key=="${scene.key}"].background.image.subject`,
        ),
      ...(holder.track && stale(holder.track.subjectId)
        ? ['track.file.subject']
        : []),
    ]
    if (paths.length === 0) continue
    writes++
    tx.patch(holder._id, (p) =>
      subjectId
        ? p
            .ifRevisionId(holder._rev)
            .set(
              Object.fromEntries(
                paths.map((path) => [
                  path,
                  { _type: 'reference', _ref: subjectId, _weak: true },
                ]),
              ),
            )
        : p.ifRevisionId(holder._rev).unset(paths),
    )
  }
  // One transaction: every copy is written, or none is.
  if (writes > 0) await tx.commit()
  return { assetRev: asset?._rev ?? null, releaseHolders: 0 }
}
