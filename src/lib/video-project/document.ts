import { generateKey } from '@/lib/sanity/helpers'
import {
  VIDEO_PROJECT_FORMAT_VERSION,
  projectFormatRefusal,
  projectSceneInputSchema,
  projectTrackInputSchema,
  type OpenedProject,
  type OpenedScene,
  type OpenedTrack,
  type ProjectSceneInput,
  type ProjectTrackInput,
} from './format'

/**
 * The stored `videoProject` document, built from and read back into the
 * format (`./format.ts`). Pure: the server resolves every file first
 * (`resolveProjectFiles` in the router) and hands the results in.
 *
 * Every array member carries a `_key`. A scene's is the editor's scene key —
 * what erasure selects a nested removal by — and text lines and element
 * motions get fresh keys on every write, since nothing selects them.
 */

const ref = (id: string) => ({ _type: 'reference' as const, _ref: id })
const weakRef = (id: string) => ({ ...ref(id), _weak: true as const })

/** A file a scene or the track holds, resolved and proven this organization's. */
export interface ResolvedFile {
  fileId: string
  galleryAssetId?: string
  /** The gallery's upload created it: a project delete may then orphan-check it. */
  createdByGallery: boolean
  /**
   * Who the gallery asset says the file shows, copied with the reference so
   * a speaker's erasure still finds the file once the asset is gone.
   */
  subjectId?: string
}

export interface ResolvedTrack extends ResolvedFile {
  title: string
  rights: { confirmedBy: string | null; confirmedAt: string } | null
}

type Stored = Record<string, unknown>

function storedImage(name: string, file: ResolvedFile): Stored {
  return {
    _type: 'image',
    asset: ref(file.fileId),
    name,
    ...(file.galleryAssetId
      ? { galleryAsset: weakRef(file.galleryAssetId) }
      : {}),
    ...(file.createdByGallery ? { createdByGallery: true } : {}),
    ...(file.subjectId ? { subject: weakRef(file.subjectId) } : {}),
  }
}

/**
 * The scenes as stored: ONE whole array, written in one `set` — never as
 * chained inserts, which `@sanity/client` collapses to the last one.
 * `files[i]` is scene `i`'s resolved background, or null for none.
 */
export function storedScenes(
  scenes: ProjectSceneInput[],
  files: (ResolvedFile | null)[],
): Stored[] {
  return scenes.map((scene, i) => {
    const { background, textLines, logo, qr } = scene.design
    const file = files[i]
    return {
      _key: scene.key,
      _type: 'videoProjectScene',
      duration: scene.duration,
      transition: scene.transition,
      drift: scene.motion.drift,
      elements: scene.motion.elements.map((m) => ({
        _key: generateKey('motion'),
        _type: 'videoProjectElement',
        element: m.id,
        entrance: m.entrance,
        exit: m.exit,
        enter: m.enter,
        leave: m.leave,
      })),
      background: {
        color: background.color,
        ...(background.image && file
          ? { image: storedImage(background.image.name, file) }
          : {}),
      },
      textLines: textLines.map((line) => ({
        _key: generateKey('line'),
        _type: 'videoProjectTextLine',
        ...line,
      })),
      logo: { ...logo },
      qr: { ...qr },
    }
  })
}

/** The track as stored, its rights confirmation copied with the reference. */
export function storedTrack(
  input: ProjectTrackInput,
  file: ResolvedTrack,
): Stored {
  return {
    file: {
      _type: 'file',
      asset: ref(file.fileId),
      ...(file.galleryAssetId
        ? { galleryAsset: weakRef(file.galleryAssetId) }
        : {}),
      ...(file.createdByGallery ? { createdByGallery: true } : {}),
      ...(file.subjectId ? { subject: weakRef(file.subjectId) } : {}),
    },
    title: file.title,
    ...(file.rights
      ? {
          rightsConfirmation: {
            ...(file.rights.confirmedBy
              ? { confirmedBy: weakRef(file.rights.confirmedBy) }
              : {}),
            confirmedAt: file.rights.confirmedAt,
          },
        }
      : {}),
    start: input.start,
    volume: input.volume,
    fadeIn: input.fadeIn,
    fadeOut: input.fadeOut,
  }
}

/**
 * A copy of a stored project's contents for Duplicate: every array member
 * gets a fresh `_key`. It is written as a document of its own, so editing
 * one never changes the other. The file references are copied
 * as they are: the copy holds the same files, which is what keeps them.
 */
export function duplicateContents(source: Stored): {
  scenes: Stored[]
  track?: Stored
} {
  const scenes = (Array.isArray(source.scenes) ? source.scenes : []).map(
    (scene: Stored) => ({
      ...scene,
      _key: generateKey('scene'),
      elements: rekey(scene.elements, 'motion'),
      textLines: rekey(scene.textLines, 'line'),
    }),
  )
  return {
    scenes,
    ...(source.track && typeof source.track === 'object'
      ? { track: source.track as Stored }
      : {}),
  }
}

function rekey(value: unknown, prefix: string): Stored[] {
  return Array.isArray(value)
    ? value.map((item: Stored) => ({ ...item, _key: generateKey(prefix) }))
    : []
}

/** A stored project as {@link OPEN_PROJECTION} reads it. */
export interface ProjectRow {
  _id: string
  _rev: string
  title: string | null
  formatVersion: unknown
  scope: 'organization' | 'edition' | null
  edition: string | null
  scenes: Array<
    Omit<OpenedScene, 'design' | 'motion'> & {
      drift: boolean | null
      elements: ProjectSceneInput['motion']['elements'] | null
      background: {
        color: string | null
        image: {
          name: string | null
          fileId: string
          galleryAssetId: string | null
          url: string | null
          width: number | null
          height: number | null
        } | null
      } | null
      textLines: ProjectSceneInput['design']['textLines'] | null
      logo: ProjectSceneInput['design']['logo'] | null
      qr: ProjectSceneInput['design']['qr'] | null
    }
  > | null
  track:
    | (Omit<ProjectTrackInput, 'galleryAssetId' | 'fileId'> & {
        fileId: string
        galleryAssetId: string | null
        title: string | null
        rights: { confirmedBy: string | null; confirmedAt: string } | null
      })
    | null
}

/** A background image's stored fields, as the open read projects them. */
const IMAGE_PROJECTION = `select(defined(background.image.asset._ref) => {
      "name": background.image.name,
      "fileId": background.image.asset._ref,
      "galleryAssetId": background.image.galleryAsset._ref,
      "url": background.image.asset->url,
      "width": background.image.asset->metadata.dimensions.width,
      "height": background.image.asset->metadata.dimensions.height
    }, null)`

/** What a project is opened with. */
export const OPEN_PROJECTION = `{
  _id,
  _rev,
  title,
  formatVersion,
  scope,
  "edition": select(scope == "edition" => conference->title, null),
  "scenes": scenes[]{
    "key": _key,
    duration,
    transition,
    drift,
    "elements": elements[]{ "id": element, entrance, exit, enter, leave },
    "background": { "color": background.color, "image": ${IMAGE_PROJECTION} },
    "textLines": textLines[]{
      text, verticalPosition, fontSize, fontFamily, isBold, isUppercase,
      color, textAlign, horizontalPosition, textPadding
    },
    logo{ size, bottom, right, variant },
    qr{ url, size, dotsColor, backgroundColor, dotsType, cornerSquareType, cornerDotType, horizontalPosition, verticalPosition }
  },
  "track": select(defined(track.file.asset._ref) => {
    "fileId": track.file.asset._ref,
    "galleryAssetId": track.file.galleryAsset._ref,
    "title": track.title,
    "rights": select(defined(track.rightsConfirmation.confirmedAt) => {
      "confirmedBy": track.rightsConfirmation.confirmedBy._ref,
      "confirmedAt": track.rightsConfirmation.confirmedAt
    }, null),
    "start": track.start,
    "volume": track.volume,
    "fadeIn": track.fadeIn,
    "fadeOut": track.fadeOut
  }, null)
}`

/** A project the studio cannot open, with the words to say why. */
export class ProjectFormatError extends Error {}

/**
 * A stored project as the studio opens it, or a {@link ProjectFormatError}
 * saying plainly why it cannot be: another format version, or a stored shape
 * this version does not read. Never a best guess. `drawable` turns a stored
 * file's CDN URL into the same-origin URL the canvas may draw.
 */
export function openedProject(
  row: ProjectRow,
  drawable: (
    url: string,
    width: number | null,
    height: number | null,
  ) => string,
): OpenedProject {
  const refusal = projectFormatRefusal(row.formatVersion)
  if (refusal) throw new ProjectFormatError(refusal)
  const unreadable = () =>
    new ProjectFormatError(
      'This project is stored in a shape the studio cannot read, so it cannot be opened.',
    )
  const scenes = (row.scenes ?? []).map((scene): OpenedScene => {
    const stored = scene.background?.image ?? null
    const parsed = projectSceneInputSchema.safeParse({
      key: scene.key,
      duration: scene.duration,
      transition: scene.transition,
      motion: { drift: scene.drift ?? false, elements: scene.elements ?? [] },
      design: {
        background: {
          color: scene.background?.color,
          image: stored
            ? {
                name: stored.name ?? '',
                fileId: stored.fileId,
                galleryAssetId: stored.galleryAssetId ?? undefined,
              }
            : null,
        },
        textLines: scene.textLines ?? [],
        logo: scene.logo,
        qr: scene.qr,
      },
    })
    if (!parsed.success) throw unreadable()
    const { design } = parsed.data
    return {
      ...parsed.data,
      design: {
        ...design,
        background: {
          color: design.background.color,
          // A file that no longer resolves falls back to the colour.
          image:
            stored?.url && design.background.image
              ? {
                  name: design.background.image.name,
                  fileId: stored.fileId,
                  ...(stored.galleryAssetId
                    ? { galleryAssetId: stored.galleryAssetId }
                    : {}),
                  url: drawable(stored.url, stored.width, stored.height),
                }
              : null,
        },
      },
    }
  })
  if (scenes.length === 0) throw unreadable()
  let track: OpenedTrack | null = null
  if (row.track) {
    const parsed = projectTrackInputSchema.safeParse(row.track)
    if (!parsed.success) throw unreadable()
    track = {
      ...parsed.data,
      fileId: row.track.fileId,
      ...(row.track.galleryAssetId
        ? { galleryAssetId: row.track.galleryAssetId }
        : {}),
      title: row.track.title ?? '',
      rights: row.track.rights,
    }
  }
  return {
    _id: row._id,
    _rev: row._rev,
    title: row.title ?? '',
    scope: row.scope === 'edition' ? 'edition' : 'organization',
    edition: row.edition,
    scenes,
    track,
  }
}

export { VIDEO_PROJECT_FORMAT_VERSION }
