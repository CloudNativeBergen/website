import type {
  OpenedProject,
  OpenedScene,
  ProjectSceneInput,
  ProjectTrackInput,
  VideoProjectRow,
} from '@/lib/video-project'
import type { MemeDesign } from './meme-generator-draw'
import type { ElementId, ElementMotion } from './meme-generator-motion'
import type { Scene } from './meme-generator-timeline'

/**
 * The editor's scenes as a saved project (docs/MARKETING_STUDIO_VIDEO_SPEC.md
 * §7), and back. Pure: what is stored is exactly what the editor draws from,
 * so a project reopened draws the same video — the round trip is pinned by
 * `meme-generator-project.test.ts`.
 */

/** What the editor needs of the studio's saved projects. Injected, as the gallery is. */
export interface VideoProjects {
  list: () => Promise<VideoProjectRow[]>
  open: (id: string) => Promise<OpenedProject>
  create: (input: {
    title: string
    edition: 'none' | 'current'
    scenes: ProjectSceneInput[]
    track?: ProjectTrackInput | null
    /** A project whose files the new one may hold as that one does. */
    copyFilesFrom?: string
  }) => Promise<{ _id: string; _rev: string; scenes: SceneFile[] }>
  save: (input: {
    id: string
    rev: string
    title: string
    scenes: ProjectSceneInput[]
  }) => Promise<{
    _rev: string
    scenes: SceneFile[]
    /** Files this save let go of that are now deleted: never drawn again. */
    released: string[]
  }>
  duplicate: (id: string) => Promise<{ _id: string }>
  delete: (id: string) => Promise<void>
}

/** Which stored file a scene's background became. */
export interface SceneFile {
  key: string
  fileId: string | null
}

/** The element order a scene's motion is stored in, so equal motion stores equal. */
const elementOrder = (id: string) =>
  id === 'logo' ? 1000 : id === 'qr' ? 1001 : Number(id.slice(4))

/**
 * The scenes as the server takes them — or the numbers (from 1) of the
 * scenes whose background is an upload not yet kept in the gallery, which
 * a project cannot hold: it holds references, never bytes.
 */
export function toProjectScenes(
  scenes: Scene[],
): { scenes: ProjectSceneInput[] } | { unkept: number[] } {
  const unkept: number[] = []
  const mapped = scenes.map((scene, i): ProjectSceneInput => {
    const { background, textLines, logo, qr } = scene.design
    const image = background.image
    if (image && !image.galleryAssetId && !image.fileId) unkept.push(i + 1)
    return {
      key: scene.key,
      duration: scene.duration,
      transition: scene.transition,
      motion: {
        drift: scene.motion.drift,
        elements: Object.entries(scene.motion.elements)
          .flatMap(([id, m]) => (m ? [{ id, ...m }] : []))
          .sort((a, b) => elementOrder(a.id) - elementOrder(b.id)),
      },
      design: {
        background: {
          color: background.color,
          image: image
            ? {
                name: image.name,
                ...(image.galleryAssetId
                  ? { galleryAssetId: image.galleryAssetId }
                  : {}),
                ...(image.fileId ? { fileId: image.fileId } : {}),
              }
            : null,
        },
        textLines: textLines.map((line) => ({ ...line })),
        logo: { ...logo },
        qr: { ...qr },
      },
    }
  })
  return unkept.length > 0 ? { unkept } : { scenes: mapped }
}

/** An opened project's scenes as the editor holds them. */
export function fromProjectScenes(scenes: OpenedScene[]): Scene[] {
  return scenes.map((scene) => {
    const { background, textLines, logo, qr } = scene.design
    const elements: Partial<Record<ElementId, ElementMotion>> = {}
    for (const { id, ...m } of scene.motion.elements)
      elements[id as ElementId] = m
    const design: MemeDesign = {
      background: {
        color: background.color,
        image: background.image
          ? {
              url: background.image.url,
              name: background.image.name,
              fileId: background.image.fileId,
              ...(background.image.galleryAssetId
                ? { galleryAssetId: background.image.galleryAssetId }
                : {}),
            }
          : null,
      },
      textLines,
      logo,
      qr,
    }
    return {
      key: scene.key,
      duration: scene.duration,
      transition: scene.transition,
      motion: { drift: scene.motion.drift, elements },
      design,
    }
  })
}

/**
 * What a save would store, as a string to compare: equal when nothing a save
 * would change has changed. An image is what is drawn, its name and its
 * gallery asset — two gallery entries can share one deduplicated file — but
 * not the file id a save carries back.
 */
export function projectSnapshot(title: string, scenes: Scene[]): string {
  return stableJson({
    title: title.trim(),
    scenes: scenes.map((scene) => ({
      ...scene,
      design: {
        ...scene.design,
        background: {
          color: scene.design.background.color,
          image: scene.design.background.image
            ? {
                url: imageIdentity(scene.design.background.image.url),
                name: scene.design.background.image.name,
                galleryAssetId:
                  scene.design.background.image.galleryAssetId ?? null,
              }
            : null,
        },
      },
    })),
  })
}

/**
 * An image as the snapshot compares it: its URL — but an upload's data URL
 * by its length and ends, never megabytes of base64 on every comparison.
 */
function imageIdentity(url: string | undefined): string | null {
  if (!url) return null
  return url.startsWith('data:')
    ? `data:${url.length}:${url.slice(0, 48)}:${url.slice(-64)}`
    : url
}

/** JSON with every object's keys sorted: equal values, equal strings. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  )
}

/**
 * The scenes with the file each background became after a save, in every
 * state undo and redo can reach — matched by the image drawn, so a later
 * save holds the file even once the gallery asset is gone.
 */
export function carryFiles(
  states: Scene[],
  files: Map<string, string>,
): Scene[] {
  return states.map((scene) => {
    const image = scene.design.background.image
    const fileId = image ? files.get(image.url) : undefined
    if (!image || !fileId || image.fileId === fileId) return scene
    return {
      ...scene,
      design: {
        ...scene.design,
        background: {
          ...scene.design.background,
          image: { ...image, fileId },
        },
      },
    }
  })
}

/**
 * A refused project call, as the editor shows it: the server's words, and
 * whether it was a save over someone else's newer one.
 */
export class VideoProjectError extends Error {
  constructor(
    message: string,
    readonly conflict = false,
  ) {
    super(message)
  }
}

/**
 * The scenes without any background whose file a save deleted: an undo must
 * never bring back an image the next save would refuse. Such a scene falls
 * back to its colour, as after an erasure.
 */
export function dropReleasedFiles(
  states: Scene[],
  released: ReadonlySet<string>,
): Scene[] {
  if (released.size === 0) return states
  return states.map((scene) => {
    const fileId = scene.design.background.image?.fileId
    if (!fileId || !released.has(fileId)) return scene
    return {
      ...scene,
      design: {
        ...scene.design,
        background: { ...scene.design.background, image: null },
      },
    }
  })
}
