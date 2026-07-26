import { arrayMove } from '@dnd-kit/sortable'
import type { PortableTextBlock } from '@portabletext/editor'
import { type HomepageSection, type HomepageSectionType } from './sections'

/**
 * Front-page builder (F3): the PURE editor logic behind the drag-and-drop
 * composition builder. Kept framework-free (no React) so the reorder handlers,
 * payload mapping, dirty check and structural-preview mapping are unit-testable
 * in isolation from the modal surface that drives them.
 */

/** Human labels for each block type — shared by the list rows and the preview. */
export const SECTION_LABELS: Record<HomepageSectionType, string> = {
  homepageHero: 'Hero',
  homepageFeaturedSpeakers: 'Featured Speakers',
  homepageProgramHighlights: 'Program Highlights',
  homepageOrganizers: 'Organizers',
  homepageSponsors: 'Sponsors',
  homepageGallery: 'Photo Gallery',
  homepageMetrics: 'Vanity Metrics',
  homepageCtaBanner: 'Call-to-action Banner',
  homepageRichText: 'Rich Text',
}

/**
 * The block types that carry per-section config worth an inline accordion. The
 * content-free blocks (featured speakers, program, organizers, sponsors,
 * gallery) only source their content from the conference, so they need no form
 * — their cards render without an expandable config panel.
 */
const CONFIGURABLE_TYPES: ReadonlySet<HomepageSectionType> = new Set([
  'homepageHero',
  'homepageCtaBanner',
  'homepageRichText',
  'homepageMetrics',
])

export function isConfigurable(type: HomepageSectionType): boolean {
  return CONFIGURABLE_TYPES.has(type)
}

/**
 * The `_key`s {@link getDefaultSections} assigns to the phase-dependent MIDDLE
 * slot (program highlights → featured speakers → organizers, mutually
 * exclusive). While a conference is still on the default layout, the preview
 * badges whichever of these is present as the auto-swapping slot so an organizer
 * understands it changes with the conference phase rather than being fixed.
 */
const PHASE_SLOT_DEFAULT_KEYS: ReadonlySet<string> = new Set([
  'default-program',
  'default-featured-speakers',
  'default-organizers',
])

/** Working row shape — a superset of every block's fields, keyed for the list. */
export interface EditorRow {
  _key: string
  _type: HomepageSectionType
  hidden?: boolean
  heroHeadline?: string
  heroSubheadline?: string
  ctaOverrides?: { _key: string; label: string; href: string }[]
  heading?: string
  body?: string
  buttonLabel?: string
  buttonHref?: string
  content?: PortableTextBlock[]
}

let keyCounter = 0
export const nextKey = () => `hp-${Date.now()}-${++keyCounter}`

export function toEditorRows(sections: HomepageSection[]): EditorRow[] {
  return sections.map((s) => {
    const row: EditorRow = {
      _key: s._key || nextKey(),
      _type: s._type,
      hidden: s.hidden,
    }
    if (s._type === 'homepageHero') {
      row.heroHeadline = s.heroHeadline
      row.heroSubheadline = s.heroSubheadline
      row.ctaOverrides = (s.ctaOverrides ?? []).map((c) => ({
        _key: c._key || nextKey(),
        label: c.label,
        href: c.href,
      }))
    } else if (s._type === 'homepageCtaBanner') {
      row.heading = s.heading
      row.body = s.body
      row.buttonLabel = s.buttonLabel
      row.buttonHref = s.buttonHref
    } else if (s._type === 'homepageRichText') {
      row.heading = s.heading
      row.content = (s.content as PortableTextBlock[]) ?? []
    } else if (s._type === 'homepageMetrics') {
      row.heading = s.heading
    }
    return row
  })
}

/** Build the mutation payload; empty strings are dropped by the server. */
export function toPayload(rows: EditorRow[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = { _type: row._type, _key: row._key }
    if (row.hidden) out.hidden = true
    switch (row._type) {
      case 'homepageHero':
        if (row.heroHeadline?.trim()) out.heroHeadline = row.heroHeadline.trim()
        if (row.heroSubheadline?.trim())
          out.heroSubheadline = row.heroSubheadline.trim()
        if (row.ctaOverrides && row.ctaOverrides.length > 0) {
          out.ctaOverrides = row.ctaOverrides
            .filter((c) => c.label.trim() && c.href.trim())
            .map((c) => ({
              _key: c._key,
              label: c.label.trim(),
              href: c.href.trim(),
            }))
        }
        break
      case 'homepageCtaBanner':
        out.heading = row.heading?.trim() ?? ''
        if (row.body?.trim()) out.body = row.body.trim()
        out.buttonLabel = row.buttonLabel?.trim() ?? ''
        out.buttonHref = row.buttonHref?.trim() ?? ''
        break
      case 'homepageRichText':
        if (row.heading?.trim()) out.heading = row.heading.trim()
        out.content = row.content ?? []
        break
      case 'homepageMetrics':
        if (row.heading?.trim()) out.heading = row.heading.trim()
        break
      default:
        break
    }
    return out
  })
}

/** Stable serialization of the composition, used for the unsaved-changes guard. */
export function serializeRows(rows: EditorRow[]): string {
  return JSON.stringify(toPayload(rows))
}

/**
 * Reorder by array position — backs the up/down buttons (the mobile + a11y
 * fallback). Out-of-range targets are a no-op so the caller can pass
 * `index ± 1` blindly at the ends.
 */
export function moveByIndex(
  rows: EditorRow[],
  from: number,
  to: number,
): EditorRow[] {
  if (to < 0 || to >= rows.length || from < 0 || from >= rows.length)
    return rows
  return arrayMove(rows, from, to)
}

/**
 * Reorder by `_key` — backs both the committed drag drop and the live preview
 * projection during a drag. Tolerant of nulls and unknown keys (returns the
 * input unchanged) so it can be called mid-drag with a not-yet-over target.
 */
export function reorderByKey(
  rows: EditorRow[],
  activeKey: string | null,
  overKey: string | null,
): EditorRow[] {
  if (!activeKey || !overKey || activeKey === overKey) return rows
  const oldIndex = rows.findIndex((r) => r._key === activeKey)
  const newIndex = rows.findIndex((r) => r._key === overKey)
  if (oldIndex === -1 || newIndex === -1) return rows
  return arrayMove(rows, oldIndex, newIndex)
}

/** A single labeled band in the structural preview panel. */
export interface PreviewBand {
  key: string
  type: HomepageSectionType
  label: string
  /** Hidden sections are ghosted in the preview (rendered, but skipped at build). */
  hidden: boolean
  /** True for the default layout's auto-swapping phase-dependent middle slot. */
  isPhaseSlot: boolean
}

/**
 * Map the working rows to structural preview bands — labeled boxes in order,
 * NOT a page render. Hidden sections stay in the list but are flagged so the
 * panel can ghost them; the phase-dependent default middle slot is flagged only
 * while the conference is still on the default layout.
 */
export function toPreviewBands(
  rows: EditorRow[],
  usingDefault: boolean,
): PreviewBand[] {
  return rows.map((r) => ({
    key: r._key,
    type: r._type,
    label: SECTION_LABELS[r._type],
    hidden: !!r.hidden,
    isPhaseSlot: usingDefault && PHASE_SLOT_DEFAULT_KEYS.has(r._key),
  }))
}
