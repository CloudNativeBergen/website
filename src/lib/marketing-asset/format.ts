import { z } from 'zod'

/**
 * A studio card's Format (docs/MARKETING_STUDIO_FORMATS_SPEC.md §2): a shape
 * and a pixel size, nothing more. A card is captured at EXACTLY these pixels,
 * never at a scale of its CSS size. Client-safe: no Sanity, no server imports.
 */
export const STUDIO_FORMAT_IDS = ['square', 'landscape', 'portrait'] as const
export type StudioFormat = (typeof STUDIO_FORMAT_IDS)[number]

export interface StudioFormatSize {
  label: string
  width: number
  height: number
}

export const STUDIO_FORMATS: Record<StudioFormat, StudioFormatSize> = {
  /** Bluesky; LinkedIn on mobile. */
  square: { label: 'Square', width: 1080, height: 1080 },
  /** LinkedIn feed and link cards (1.91:1). */
  landscape: { label: 'Landscape', width: 1200, height: 628 },
  /** LinkedIn mobile feed at full height; Bluesky (4:5). */
  portrait: { label: 'Portrait', width: 1080, height: 1350 },
}

/**
 * What everything without a Format reads as (§6): render Tasks, Recipes and
 * gallery entries alike, with no migration — square is what every existing
 * render is.
 */
export const DEFAULT_STUDIO_FORMAT: StudioFormat = 'square'

export const studioFormatSchema = z.enum(STUDIO_FORMAT_IDS)

/** The CSS aspect ratio a card of this Format is laid out in. */
export function studioFormatAspect(format: StudioFormat): string {
  const { width, height } = STUDIO_FORMATS[format]
  return `${width} / ${height}`
}

/** "Landscape (1200×628)": the Format named with its pixels, for people. */
export function studioFormatLabel(format: StudioFormat): string {
  const { label, width, height } = STUDIO_FORMATS[format]
  return `${label} (${width}×${height})`
}
