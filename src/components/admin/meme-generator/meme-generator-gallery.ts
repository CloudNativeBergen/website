/**
 * What the editor needs of the organization's marketing asset gallery to use
 * its images as scene backgrounds (docs/MARKETING_STUDIO_VIDEO_SPEC.md §5, §7).
 * Injected, so the editor never knows about tRPC or Blob: the studio page
 * builds the real one, and stories and tests give their own. Without one the
 * editor works as before, on local files only.
 */

/** One gallery image as the picker shows it. */
export interface GalleryImage {
  _id: string
  title: string
  alt: string
  /** A small rendition for the picker. Shown as an `<img>`, never drawn. */
  thumbnailUrl: string | null
}

/** One gallery audio track as the music picker shows it (#1178). */
export interface GalleryTrack {
  _id: string
  title: string
  durationSeconds: number
}

import type { TrackSource } from '@/lib/video-project'

/** Where a track's bytes come from: a gallery track, or a saved project's. */
export type { TrackSource }

export interface BackgroundGallery {
  /** The organization's images to choose from. */
  images: () => Promise<GalleryImage[]>
  /**
   * One image by id, as a SAME-ORIGIN URL the canvas can draw without being
   * tainted. The server proves the id is this organization's.
   */
  resolve: (id: string) => Promise<{ _id: string; title: string; url: string }>
  /**
   * Put an uploaded background in the gallery, through its own upload path,
   * or throw a message to show.
   */
  keep: (
    file: File,
    details: { title: string; alt: string },
  ) => Promise<{
    _id: string
  }>
  /** The organization's audio tracks, for a video's music (spec §6). */
  tracks?: () => Promise<GalleryTrack[]>
  /**
   * A track's file, through our own origin: the Sanity CDN sends no CORS
   * header to tenant domains. The server proves the source ours.
   */
  loadTrack?: (source: TrackSource, signal: AbortSignal) => Promise<ArrayBuffer>
}
