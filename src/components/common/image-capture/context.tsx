'use client'

import { createContext, useContext } from 'react'
import type {
  ExportSourceInput,
  StudioFormat,
  StudioTab,
} from '@/lib/marketing-asset'

export interface ImageAttachment {
  busy: boolean
  attach: (capture: () => Promise<Blob>, filename: string) => Promise<void>
}
export const ImageAttachmentContext = createContext<ImageAttachment | null>(
  null,
)
export const useImageAttachment = () => useContext(ImageAttachmentContext)

/**
 * What a studio card knows about itself when it is saved to the marketing
 * asset gallery (docs/MARKETING_ASSETS_SPEC.md §4.2): the tab it is on, and,
 * for a speaker or sponsor card, who it is about and the words to prefill.
 */
export interface StudioCard {
  tab: StudioTab
  /** The prefilled title; empty asks the organizer for one. */
  title: string
  /** The prefilled alt text, where the card knows its subject. */
  alt?: string
  subject?: { type: 'speaker' | 'sponsor'; id: string; name: string }
  /**
   * The Format the card was shown, and so captured, in (docs/MARKETING_
   * STUDIO_FORMATS_SPEC.md §4). Absent on a tab without a Format switch.
   */
  format?: StudioFormat
}

/**
 * The Format a studio tab is showing (spec §4): set by the tab's Format switch,
 * read by every card on the tab to lay itself out and by every capture to
 * size itself. Null outside a switch, where a card is square and a capture is
 * 4× its CSS box, as before Formats.
 */
export const StudioFormatContext = createContext<StudioFormat | null>(null)

/**
 * Why a capture is refused when the switch moved under it (spec §4): the
 * render would be stretched to the old Format. Shown to the organizer as it
 * is, on every path.
 */
export const FORMAT_CHANGED =
  'The Format changed while the image was being made. Try again.'
export const useStudioFormat = () => useContext(StudioFormatContext)

/** A finished MP4 from the meme generator's export (#1182). */
export interface ExportedVideo {
  blob: Blob
  /** Draws the first frame and encodes it as a JPEG, for the gallery. */
  poster: () => Promise<Blob>
}

/** Where an exported video came from, for its gallery record. */
export interface VideoOrigin {
  /** The project's title, to prefill the asset's. */
  title: string
  /** The saved project it was exported from; null for an unsaved video. */
  projectId: string | null
  /**
   * The backgrounds it showed, as the editor knew them at export time:
   * what a speaker erasure finds the video by, whatever its project holds
   * later. Empty for a video of colours, or of uploads never kept.
   */
  sources: ExportSourceInput[]
}

/** "Save to gallery", present on every studio card, Task or not. */
export interface GallerySave {
  busy: boolean
  save: (
    capture: () => Promise<Blob>,
    filename: string,
    card: StudioCard,
  ) => Promise<void>
  /** An exported video, from Video mode's export panel. */
  saveVideo: (video: ExportedVideo, origin: VideoOrigin) => void
}
export const GallerySaveContext = createContext<GallerySave | null>(null)
export const useGallerySave = () => useContext(GallerySaveContext)
