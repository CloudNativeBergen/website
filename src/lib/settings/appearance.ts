/**
 * Information architecture for the admin **Appearance** section
 * (`/admin/settings/appearance`) — brand and theming, lifted out of the single
 * `/admin/settings` page into its own section with sub-pages.
 *
 * This module is the single source of truth for the sub-section identities so
 * the section's pill nav, the page headers and the ⌘K registry entries can never
 * drift apart — the same contract `@/lib/settings/groups` provides for the
 * tier-1 anchors on the settings page itself.
 *
 * Pure data: no icons, no JSX, no server imports, so both server pages and the
 * (client-safe) registry can consume it.
 */

export type AppearanceSectionId = 'overview' | 'theme' | 'logos' | 'homepage'

export interface AppearanceSection {
  /** Stable id — also the last path segment (except `overview`, the root). */
  id: AppearanceSectionId
  /** Short label shown in the section pill nav. */
  navLabel: string
  /** Page `<h1>` for this sub-page. */
  title: string
  /** One-line orientation text under the page heading. */
  description: string
  /** Absolute admin path. */
  href: string
}

/** Root of the Appearance section. */
export const APPEARANCE_ROOT = '/admin/settings/appearance'

/**
 * The Appearance sub-sections, in nav order. `overview` is the section hub: a
 * read-only summary of all three, each card linking to its sub-page.
 *
 * FUTURE: typography (font selection) lands on `theme` — a font is a theme
 * token like a colour, and a page holding one dropdown would be a worse
 * experience than one more field beside the palette. Homepage templates, hero
 * variants and lifecycle states land on `homepage`.
 */
export const APPEARANCE_SECTIONS: readonly AppearanceSection[] = [
  {
    id: 'overview',
    navLabel: 'Overview',
    title: 'Appearance',
    description:
      'Brand colours, logos and the composition of the public homepage.',
    href: APPEARANCE_ROOT,
  },
  {
    id: 'theme',
    navLabel: 'Theme',
    title: 'Theme',
    description:
      'The brand palette and page background applied across the public site.',
    href: `${APPEARANCE_ROOT}/theme`,
  },
  {
    id: 'logos',
    // Short enough that all four pills fit a 393px viewport without scrolling.
    navLabel: 'Logos',
    title: 'Logos & marks',
    description:
      'Horizontal logos and icon-only marks, in light- and dark-background variants.',
    href: `${APPEARANCE_ROOT}/logos`,
  },
  {
    id: 'homepage',
    navLabel: 'Homepage',
    title: 'Homepage',
    description:
      'Which sections the public front page renders, in what order, and the numbers they show.',
    href: `${APPEARANCE_ROOT}/homepage`,
  },
]

/** Section id → section metadata, for page headers. */
export const APPEARANCE_SECTION: Record<
  AppearanceSectionId,
  AppearanceSection
> = Object.fromEntries(APPEARANCE_SECTIONS.map((s) => [s.id, s])) as Record<
  AppearanceSectionId,
  AppearanceSection
>
