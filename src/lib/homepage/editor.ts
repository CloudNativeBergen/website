/**
 * Local copy of `@dnd-kit/sortable`'s `arrayMove`, semantics preserved
 * (including the negative-index handling this module never relies on).
 *
 * Inlined DELIBERATELY. `arrayMove` is a pure four-line array helper, but
 * importing it from `@dnd-kit/sortable` pulls that package's React context into
 * whatever module graph reaches this file. The package is client-only, so any
 * server component importing anything from here — a label map, a type guard —
 * died at build time with `createContext is not a function` while collecting
 * page data. Four lines of duplication buys this module ZERO runtime
 * dependencies, which is what a pure model/logic module should have.
 */
function arrayMove<T>(array: readonly T[], from: number, to: number): T[] {
  const next = array.slice()
  next.splice(to < 0 ? next.length + to : to, 0, next.splice(from, 1)[0])
  return next
}
import { sanitizeRichTextContent, type RichTextContentBlock } from './richText'
import {
  SECTION_LABELS,
  type HomepageSection,
  type HomepageSectionType,
} from './sections'

// Re-exported for the editor surface, which historically imported it from here.
export { SECTION_LABELS }

/**
 * Front-page builder (F3): the PURE editor logic behind the drag-and-drop
 * composition builder. Kept framework-free (no React) so the reorder handlers,
 * payload mapping, dirty check and structural-preview mapping are unit-testable
 * in isolation from the modal surface that drives them.
 */

/**
 * The block types that carry per-section config worth an inline accordion.
 * The content-sourced bands (featured speakers, organizers, sponsors, gallery)
 * still pull their CONTENT from the conference, but their headings and body
 * copy are per-section config, so they get a form too. Program highlights is
 * the only block with nothing to configure.
 */
const CONFIGURABLE_TYPES: ReadonlySet<HomepageSectionType> = new Set([
  'homepageHero',
  'homepageSaveTheDate',
  'homepageCtaBanner',
  'homepageRichText',
  'homepageMetrics',
  'homepageFaq',
  'homepageCountdown',
  'homepageVenue',
  'homepageFeaturedSpeakers',
  'homepageOrganizers',
  'homepageSponsors',
  'homepageGallery',
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
  // The save-the-date band is itself lifecycle-conditional: it appears only
  // while the event has no programme and no featured speakers to show.
  'default-save-the-date',
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
  content?: RichTextContentBlock[]
  // FAQ block
  source?: 'own' | 'ticketFaqs'
  faqItems?: { _key: string; question: string; answer: string }[]
  // Countdown block
  targetOverride?: string
  liveMessage?: string
  // Venue block + the copy-configurable content bands (featured speakers,
  // organizers, sponsors, gallery) share `heading`/`description`.
  description?: string
  // Sponsors block
  showCta?: boolean
  ctaHeading?: string
  ctaDescription?: string
}

let keyCounter = 0
/**
 * Stored ISO instant → the LOCAL wall-clock string a `datetime-local` input
 * expects (and back, below). Same round-trip discipline as the workshop
 * registration editor: local into the input, ISO instant into storage.
 */
export function isoToLocalInput(value?: string): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function localInputToIso(value?: string): string | undefined {
  const v = value?.trim()
  if (!v) return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

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
      // Normalise on LOAD as well as on save: the row the editor mutates is
      // always the allowlisted shape, whatever the dataset happens to hold.
      row.content = sanitizeRichTextContent(s.content)
    } else if (
      s._type === 'homepageMetrics' ||
      s._type === 'homepageSaveTheDate'
    ) {
      row.heading = s.heading
      if (s._type === 'homepageSaveTheDate') row.description = s.description
    } else if (s._type === 'homepageFaq') {
      row.heading = s.heading
      row.source = s.source ?? 'own'
      row.faqItems = (s.items ?? []).map((i) => ({
        _key: i._key || nextKey(),
        question: i.question,
        answer: i.answer,
      }))
    } else if (s._type === 'homepageCountdown') {
      row.heading = s.heading
      row.targetOverride = isoToLocalInput(s.targetOverride)
      row.liveMessage = s.liveMessage
    } else if (s._type === 'homepageVenue') {
      row.heading = s.heading
      row.description = s.description
    } else if (
      s._type === 'homepageFeaturedSpeakers' ||
      s._type === 'homepageOrganizers' ||
      s._type === 'homepageGallery'
    ) {
      row.heading = s.heading
      row.description = s.description
    } else if (s._type === 'homepageSponsors') {
      row.heading = s.heading
      row.description = s.description
      // Absent means "shown" — surface it as the checked state so the form
      // round-trips an unconfigured block to an identical payload.
      row.showCta = s.showCta !== false
      row.ctaHeading = s.ctaHeading
      row.ctaDescription = s.ctaDescription
    }
    return row
  })
}

/**
 * Build the mutation payload. Empty/blank optional fields are omitted HERE
 * (the server schema trims and REJECTS empty strings via `.min(1)`, it does
 * not drop them) — the editor's own `validate()` catches required-field gaps
 * with friendlier messages before the payload is built.
 */
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
      case 'homepageSaveTheDate':
        if (row.heading?.trim()) out.heading = row.heading.trim()
        if (row.description?.trim()) out.description = row.description.trim()
        break
      case 'homepageFaq': {
        if (row.heading?.trim()) out.heading = row.heading.trim()
        const source = row.source ?? 'own'
        if (source === 'ticketFaqs') {
          out.source = 'ticketFaqs'
        } else {
          // 'own' is the default; only store items (source stays implicit).
          const items = (row.faqItems ?? [])
            .filter((i) => i.question.trim() && i.answer.trim())
            .map((i) => ({
              _key: i._key,
              question: i.question.trim(),
              answer: i.answer.trim(),
            }))
          if (items.length > 0) out.items = items
        }
        break
      }
      case 'homepageCountdown':
        if (row.heading?.trim()) out.heading = row.heading.trim()
        {
          // The datetime-local value is a timezone-less LOCAL wall-clock
          // string; persist the unambiguous ISO instant so the server-side
          // target resolution can never re-interpret it in the server's zone.
          const iso = localInputToIso(row.targetOverride)
          if (iso) out.targetOverride = iso
        }
        if (row.liveMessage?.trim()) out.liveMessage = row.liveMessage.trim()
        break
      case 'homepageVenue':
      case 'homepageFeaturedSpeakers':
      case 'homepageOrganizers':
      case 'homepageGallery':
        if (row.heading?.trim()) out.heading = row.heading.trim()
        if (row.description?.trim()) out.description = row.description.trim()
        break
      case 'homepageSponsors':
        if (row.heading?.trim()) out.heading = row.heading.trim()
        if (row.description?.trim()) out.description = row.description.trim()
        // Only the non-default state is stored, so an untouched sponsors block
        // serializes to exactly `{_type, _key}` as it did before.
        if (row.showCta === false) out.showCta = false
        if (row.ctaHeading?.trim()) out.ctaHeading = row.ctaHeading.trim()
        if (row.ctaDescription?.trim())
          out.ctaDescription = row.ctaDescription.trim()
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
