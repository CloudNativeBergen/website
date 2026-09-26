import { z } from 'zod'

/**
 * A saved studio video — a **project** (docs/MARKETING_STUDIO_VIDEO_SPEC.md
 * §7) — as the editor and the server exchange it. Client-safe: no Sanity, no
 * server imports. The stored document is built from this on the server
 * (`./document.ts`) and read back into it; the editor maps it to and from its
 * own scenes.
 *
 * REFERENCES, NEVER BYTES. A scene's background names a gallery asset (or the
 * file an earlier save already stored); a data URL is never accepted. QR codes
 * are their settings; the image is regenerated on open.
 */

/**
 * The format this code writes and reads. A project stored under any other
 * version is refused with {@link projectFormatRefusal}; it is never read as
 * if it were this one. Bump it with a migration when the stored shape
 * changes meaning.
 */
export const VIDEO_PROJECT_FORMAT_VERSION = 1

export const VIDEO_PROJECT_MAX_TITLE = 120
/** A minute of scenes, each at least a second. */
export const VIDEO_PROJECT_MAX_SCENES = 60
const MAX_SECONDS = 60

/**
 * A Sanity `_key`, or a scene key the editor made: safe to put in an erasure
 * selector (`scenes[_key=="…"]`) as it is.
 */
export const PROJECT_KEY = /^[A-Za-z0-9._-]{1,64}$/

/** A published document id: never a draft or Content Release version. */
const documentId = z
  .string()
  .min(1)
  .max(200)
  .refine((id) => !id.includes('.'), 'Not a published document id')

const finite = (min: number, max: number) =>
  z.number().finite().min(min).max(max)
const colour = z.string().max(40)

const textLineSchema = z.object({
  text: z.string().max(500),
  verticalPosition: finite(0, 100),
  fontSize: finite(1, 1000),
  fontFamily: z.string().min(1).max(100),
  isBold: z.boolean(),
  isUppercase: z.boolean(),
  color: colour,
  textAlign: z.enum(['left', 'center', 'right']),
  horizontalPosition: finite(0, 100),
  textPadding: finite(0, 100),
})

const QR_DOT = [
  'dots',
  'rounded',
  'classy',
  'classy-rounded',
  'square',
  'extra-rounded',
] as const
const QR_CORNER_SQUARE = ['dot', 'square', 'extra-rounded', ...QR_DOT] as const
const QR_CORNER_DOT = ['dot', 'square', ...QR_DOT] as const

const qrSchema = z.object({
  url: z.string().max(2000),
  size: finite(1, 1080),
  dotsColor: colour,
  backgroundColor: colour,
  dotsType: z.enum(QR_DOT),
  cornerSquareType: z.enum(QR_CORNER_SQUARE),
  cornerDotType: z.enum(QR_CORNER_DOT),
  horizontalPosition: finite(0, 100),
  verticalPosition: finite(0, 100),
})

const logoSchema = z.object({
  size: finite(1, 1080),
  bottom: finite(0, 1080),
  right: finite(0, 1080),
  variant: z.enum(['gradient', 'monochrome']),
})

const PRESET = ['none', 'fade', 'slide-up', 'pop'] as const
const elementId = z.string().regex(/^(text\d{1,2}|logo|qr)$/)

const elementMotionSchema = z
  .object({
    id: elementId,
    entrance: z.enum(PRESET),
    exit: z.enum(PRESET),
    enter: finite(0, MAX_SECONDS),
    leave: finite(0, MAX_SECONDS),
  })
  .refine((m) => m.leave >= m.enter, 'An exit never precedes its entrance')

/**
 * A scene's background image as the editor sends it: the gallery asset it
 * came from, and/or the file an earlier save of THIS project stored. The
 * server accepts a file only if the project already holds it, and otherwise
 * resolves the gallery asset, proven this organization's — so a client can
 * never name an arbitrary file.
 */
const imageInputSchema = z
  .object({
    name: z.string().max(200),
    galleryAssetId: documentId.optional(),
    fileId: z.string().min(1).max(200).optional(),
  })
  .nullable()

export const projectSceneInputSchema = z.object({
  key: z.string().regex(PROJECT_KEY),
  duration: finite(1, MAX_SECONDS),
  transition: z.enum(['cut', 'fade', 'slide', 'zoom']),
  motion: z.object({
    drift: z.boolean(),
    elements: z.array(elementMotionSchema).max(20),
  }),
  design: z.object({
    background: z.object({ color: colour, image: imageInputSchema }),
    textLines: z.array(textLineSchema).max(10),
    logo: logoSchema,
    qr: qrSchema,
  }),
})

/**
 * The video's music (spec §6), as far as a project stores it: which track,
 * and how it plays. The editor has no music yet (#1179); the format and the
 * server's resolution — the file, a weak pointer to the gallery asset, and
 * the rights confirmation copied from it — are here so a saved track
 * survives the asset's deletion as a background does.
 */
export const projectTrackInputSchema = z.object({
  galleryAssetId: documentId.optional(),
  fileId: z.string().min(1).max(200).optional(),
  /** Where in the track the video starts, in seconds. */
  start: finite(0, 600),
  /** 0 to 1. */
  volume: finite(0, 1),
  fadeIn: finite(0, MAX_SECONDS),
  fadeOut: finite(0, MAX_SECONDS),
})

export const projectScenesSchema = z
  .array(projectSceneInputSchema)
  .min(1)
  .max(VIDEO_PROJECT_MAX_SCENES)
  .refine(
    (scenes) => new Set(scenes.map((s) => s.key)).size === scenes.length,
    'Scene keys must be unique',
  )
  .refine(
    // In tenths, as the editor sums them: 1.1 + 2.2 is not 3.3 in floats.
    (scenes) =>
      scenes.reduce((sum, s) => sum + Math.round(s.duration * 10), 0) <=
      MAX_SECONDS * 10,
    'A video is at most a minute',
  )

export const projectTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(VIDEO_PROJECT_MAX_TITLE)

export type ProjectSceneInput = z.output<typeof projectSceneInputSchema>
export type ProjectTrackInput = z.output<typeof projectTrackInputSchema>

/** A background image as a project is opened with it: drawable, same-origin. */
export interface OpenedImage {
  name: string
  /** The stored file; sent back on save to keep it without the gallery. */
  fileId: string
  /** The gallery asset it came from, if any — possibly deleted since. */
  galleryAssetId?: string
  /** Same-origin (the image proxy), so drawing it never taints the canvas. */
  url: string
}

export type OpenedScene = Omit<ProjectSceneInput, 'design'> & {
  design: Omit<ProjectSceneInput['design'], 'background'> & {
    background: { color: string; image: OpenedImage | null }
  }
}

export interface OpenedTrack extends Omit<ProjectTrackInput, 'galleryAssetId'> {
  fileId: string
  galleryAssetId?: string
  title: string
  rights: { confirmedBy: string | null; confirmedAt: string } | null
}

/** A project as the studio opens it. */
export interface OpenedProject {
  _id: string
  /** The revision the editor loaded: every save is compare-and-set on it. */
  _rev: string
  title: string
  scope: 'organization' | 'edition'
  edition: string | null
  scenes: OpenedScene[]
  track: OpenedTrack | null
}

/** A project in the studio's list. */
export interface VideoProjectRow {
  _id: string
  title: string
  scope: 'organization' | 'edition'
  edition: string | null
  updatedAt: string
  scenes: number
}

/**
 * Why a stored project cannot be opened, in words an organizer can act on —
 * or null when its version is this code's.
 */
export function projectFormatRefusal(version: unknown): string | null {
  if (version === VIDEO_PROJECT_FORMAT_VERSION) return null
  if (
    typeof version === 'number' &&
    Number.isInteger(version) &&
    version > VIDEO_PROJECT_FORMAT_VERSION
  )
    return `This project was saved by a newer version of the studio (format ${version}) and cannot be opened here. Reload the page to get the latest studio.`
  return 'This project was saved in a format this studio cannot read, so it cannot be opened.'
}

/** The refusal for a save over a scene whose background was not kept. */
export function unkeptBackgroundRefusal(sceneNumbers: number[]): string {
  const list =
    sceneNumbers.length === 1
      ? `Scene ${sceneNumbers[0]}'s background is`
      : `The backgrounds of scenes ${sceneNumbers.slice(0, -1).join(', ')} and ${sceneNumbers[sceneNumbers.length - 1]} are`
  return `${list} not in the gallery, so the project cannot be saved. Keep ${sceneNumbers.length === 1 ? 'it' : 'each'} in the gallery or choose one from it, then save.`
}

export const PROJECT_CONFLICT_MESSAGE =
  'Someone saved this project after you opened it. Your changes were not saved. Save them as a new project, or reopen it to see theirs.'

/** "Copy of" a title, within the title limit. */
export function copyTitle(title: string): string {
  return `Copy of ${title}`.slice(0, VIDEO_PROJECT_MAX_TITLE)
}
