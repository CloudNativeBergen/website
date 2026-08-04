/**
 * Information architecture for the admin **Appearance** page
 * (`/admin/settings/appearance`) — brand and theming, lifted out of the single
 * `/admin/settings` page into its own page.
 *
 * ONE page with in-page anchors, not a hub plus sub-pages: each former sub-page
 * was a grid of one or two read-only cards whose bodies duplicated the hub's,
 * existing only to host an edit affordance — navigation charging rent on
 * content that fits upstairs. The sub-section identities survive as ANCHORS, so
 * the chip nav, the section headings and the ⌘K registry entries still come
 * from one table and can never drift apart. The old sub-page URLs redirect to
 * these anchors.
 *
 * Pure data: no icons, no JSX, no server imports, so both server pages and the
 * (client-safe) registry can consume it.
 */

export type AppearanceSectionId = 'theme' | 'logos' | 'homepage'

export interface AppearanceSection {
  /** Stable id — also the in-page anchor and the legacy sub-path segment. */
  id: AppearanceSectionId
  /** Short label shown in the sticky chip nav. */
  navLabel: string
  /** Section heading on the page. */
  title: string
  /** One-line orientation text under the heading. */
  description: string
  /** Absolute admin path including the anchor. */
  href: string
}

/** Root of the Appearance page. */
export const APPEARANCE_ROOT = '/admin/settings/appearance'

/** The page itself: `<h1>` and the line under it. */
export const APPEARANCE_PAGE = {
  title: 'Appearance',
  description:
    'Brand colours, logos and the composition of the public homepage.',
  href: APPEARANCE_ROOT,
} as const

/**
 * The Appearance sections, in page order — each an anchored region of the one
 * page.
 *
 * FUTURE: typography (font selection) lands in `theme` — a font is a theme
 * token like a colour, and it belongs beside the palette. Homepage templates,
 * hero variants and lifecycle states land in `homepage`. The one-page layout
 * absorbs all of it without a new route.
 */
export const APPEARANCE_SECTIONS: readonly AppearanceSection[] = [
  {
    id: 'theme',
    navLabel: 'Theme',
    title: 'Theme',
    description:
      'The brand palette and page background applied across the public site.',
    href: `${APPEARANCE_ROOT}#theme`,
  },
  {
    id: 'logos',
    // Short enough that all three chips fit a 393px viewport without scrolling.
    navLabel: 'Logos',
    title: 'Logos & marks',
    description:
      'Horizontal logos and icon-only marks, in light- and dark-background variants.',
    href: `${APPEARANCE_ROOT}#logos`,
  },
  {
    id: 'homepage',
    navLabel: 'Homepage',
    title: 'Homepage',
    description:
      'Which sections the public front page renders, in what order, and the numbers they show.',
    href: `${APPEARANCE_ROOT}#homepage`,
  },
]

/** Section id → section metadata, for headings and deep links. */
export const APPEARANCE_SECTION: Record<
  AppearanceSectionId,
  AppearanceSection
> = Object.fromEntries(APPEARANCE_SECTIONS.map((s) => [s.id, s])) as Record<
  AppearanceSectionId,
  AppearanceSection
>
