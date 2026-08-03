import type { HomepageSectionType } from './sections'

/**
 * Front-page builder: the CLOSED per-section VARIANT registry.
 *
 * A variant is a presentation hint — "how should this section look?" — kept
 * strictly separate from a section's content and from its behaviour toggles
 * (`hidden`, FAQ `source`, sponsors `showCta`), which remain independent
 * fields. Like the section-type registry itself, the variant list is CLOSED:
 * every entry maps to vetted house markup, and the write
 * path validates against this table, so a tenant can never invent a layout.
 *
 * ZERO-MIGRATION GUARANTEE, extended to variants:
 *
 *  1. The FIRST entry of every list is the DEFAULT, and the default renders
 *     byte-identically to the pre-variant markup. Order is load-bearing —
 *     APPEND new variants, never reorder.
 *  2. An ABSENT variant resolves to that default ({@link resolveVariant}), so
 *     the conference editions that store no variant keep rendering exactly what
 *     they render today.
 *  3. The default is never PERSISTED (the save path only writes a non-default
 *     variant), so a composition saved without touching the picker serializes to
 *     the same bytes it does today.
 *
 * SERVER SAFETY: this module has ZERO runtime imports — only an erased
 * `import type` back-edge to `./sections` — for two reasons. It is reachable
 * from server components through the render tree (a value import from a
 * client-only package would put that package's React context in the RSC module
 * graph and kill the production build with `createContext is not a function`),
 * and the Sanity Studio's Vite build imports it by relative path to drive the
 * schema's variant option lists. Asserted on the source text in
 * `variants.test.ts` — typecheck cannot see either hazard.
 */
export const SECTION_VARIANTS = {
  homepageHero: ['classic', 'minimal', 'emblem'],
  homepageSaveTheDate: ['card', 'strip'],
  homepageFeaturedSpeakers: ['shelf', 'grid'],
  homepageProgramHighlights: ['full', 'talks'],
  homepageOrganizers: ['cards', 'compact'],
  homepageSponsors: ['tiers', 'logo-wall'],
  homepageGallery: ['carousel', 'mosaic'],
  homepageMetrics: ['row', 'band'],
  homepageCtaBanner: ['plain', 'panel'],
  homepageRichText: ['article', 'boxed'],
  homepageFaq: ['accordion', 'list'],
  homepageCountdown: ['units', 'strip'],
  homepageVenue: ['card', 'split'],
} as const satisfies Record<HomepageSectionType, readonly [string, ...string[]]>

export type SectionVariantMap = typeof SECTION_VARIANTS

/** The allowed variant names for one section type. */
export type SectionVariant<T extends HomepageSectionType> =
  SectionVariantMap[T][number]

/** Any variant name in the registry — the union across all section types. */
export type AnySectionVariant = SectionVariant<HomepageSectionType>

/**
 * The default variant for a section type: the FIRST entry, which by the
 * invariant above is today's rendering.
 */
export function defaultVariant<T extends HomepageSectionType>(
  type: T,
): SectionVariant<T> {
  return SECTION_VARIANTS[type][0] as SectionVariant<T>
}

/** Whether `value` is a registered variant of `type`. */
export function isSectionVariant<T extends HomepageSectionType>(
  type: T,
  value: unknown,
): value is SectionVariant<T> {
  return (
    typeof value === 'string' &&
    (SECTION_VARIANTS[type] as readonly string[]).includes(value)
  )
}

/** Unknown `type:variant` pairs already warned about (once per process). */
const warnedUnknownVariants = new Set<string>()

/**
 * Resolve the variant to render: ABSENT → the default; a registered variant →
 * itself; anything else → the default, with a `console.warn` once per distinct
 * `(type, variant)` per process (this runs on every render of the page).
 *
 * FORWARD COMPAT: the variant sibling of the renderer's unknown-`_type`
 * skip-with-warn, with one deliberate difference — an unknown VARIANT falls back
 * to the default RENDERING instead of skipping the section. The section's
 * content is still valid; only its presentation hint comes from the future.
 * Skipping would hide real content on an older deploy during a rollout.
 *
 * `type` must be a registered section type: the renderer has already skipped
 * unknown `_type`s before any variant is resolved.
 */
export function resolveVariant<T extends HomepageSectionType>(
  type: T,
  stored: string | undefined,
): SectionVariant<T> {
  if (stored === undefined) return defaultVariant(type)
  if (isSectionVariant(type, stored)) return stored
  const key = `${type}:${stored}`
  if (!warnedUnknownVariants.has(key)) {
    warnedUnknownVariants.add(key)
    console.warn(
      `[homepage] unknown variant '${stored}' for ${type} — rendering '${defaultVariant(type)}'`,
    )
  }
  return defaultVariant(type)
}

/** Picker labels, per section type. Server-safe, like `SECTION_LABELS`. */
export const VARIANT_LABELS: {
  [T in HomepageSectionType]: Record<SectionVariant<T>, string>
} = {
  homepageHero: {
    classic: 'Classic',
    minimal: 'Minimal',
    emblem: 'Emblem',
  },
  homepageSaveTheDate: { card: 'Card', strip: 'Strip' },
  homepageFeaturedSpeakers: { shelf: 'Shelf', grid: 'Grid' },
  homepageProgramHighlights: { full: 'Full', talks: 'Talks only' },
  homepageOrganizers: { cards: 'Cards', compact: 'Compact' },
  homepageSponsors: { tiers: 'Tiers', 'logo-wall': 'Logo wall' },
  homepageGallery: { carousel: 'Carousel', mosaic: 'Mosaic' },
  homepageMetrics: { row: 'Row', band: 'Band' },
  homepageCtaBanner: { plain: 'Plain', panel: 'Panel' },
  homepageRichText: { article: 'Article', boxed: 'Boxed' },
  homepageFaq: { accordion: 'Accordion', list: 'Open list' },
  homepageCountdown: { units: 'Units', strip: 'Strip' },
  homepageVenue: { card: 'Card', split: 'Split' },
}

/** One-line picker helper text, per section type. */
export const VARIANT_DESCRIPTIONS: {
  [T in HomepageSectionType]: Record<SectionVariant<T>, string>
} = {
  homepageHero: {
    classic: 'Tagline, description, call to action, venue line and metrics.',
    minimal:
      'Tagline, description and call to action only — no venue line, metrics or social row.',
    emblem: 'Text on the left, a large conference mark on the right.',
  },
  homepageSaveTheDate: {
    card: 'Boxed card with a countdown and the “what happens next” roadmap.',
    strip: 'One slim band: dates, place and a compact countdown.',
  },
  homepageFeaturedSpeakers: {
    shelf: 'Horizontal carousel that scrolls sideways.',
    grid: 'Static grid — every speaker visible at once.',
  },
  homepageProgramHighlights: {
    full: 'Statistics tiles, featured talks and speakers, and a call to action.',
    talks: 'Featured talks and speakers only, without the statistics tiles.',
  },
  homepageOrganizers: {
    cards: 'One card per organizer.',
    compact: 'Dense avatar, name and role rows without cards.',
  },
  homepageSponsors: {
    tiers: 'Sponsors grouped under their tier headings.',
    'logo-wall': 'One flat logo grid with no tier headings.',
  },
  homepageGallery: {
    carousel: 'Auto-playing image carousel.',
    mosaic: 'Static image grid — no motion; opens the full gallery on click.',
  },
  homepageMetrics: {
    row: 'Plain row of numbers on the page background.',
    band: 'The same numbers on a full-width tinted band.',
  },
  homepageCtaBanner: {
    plain: 'Centered heading, body and button on the page background.',
    panel: 'The same content inside a boxed gradient panel.',
  },
  homepageRichText: {
    article: 'A plain prose column.',
    boxed: 'The same content inside the house card chrome.',
  },
  homepageFaq: {
    accordion: 'Questions collapse and expand on click.',
    list: 'Every answer shown, in two columns on wide screens.',
  },
  homepageCountdown: {
    units: 'Large days, hours, minutes and seconds tiles.',
    strip: 'One compact line.',
  },
  homepageVenue: {
    card: 'Centered card with a directions button.',
    split: 'Heading and description on the left, address card on the right.',
  },
}
