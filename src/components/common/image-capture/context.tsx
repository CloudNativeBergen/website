'use client'

import { createContext, useContext } from 'react'
import type { StudioTab } from '@/lib/marketing-asset'

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
}

/** "Save to gallery", present on every studio card, Task or not. */
export interface GallerySave {
  busy: boolean
  save: (
    capture: () => Promise<Blob>,
    filename: string,
    card: StudioCard,
  ) => Promise<void>
}
export const GallerySaveContext = createContext<GallerySave | null>(null)
export const useGallerySave = () => useContext(GallerySaveContext)
