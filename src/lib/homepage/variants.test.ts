import { afterEach, describe, expect, it, vi } from 'vitest'
import { HOMEPAGE_SECTION_TYPES, type HomepageSectionType } from './sections'
import {
  SECTION_VARIANTS,
  type SectionVariant,
  VARIANT_DESCRIPTIONS,
  VARIANT_LABELS,
  defaultVariant,
  isSectionVariant,
  resolveVariant,
} from './variants'

/**
 * The registry these snapshots pin is a CONTRACT, not an implementation detail:
 * the first entry of every list is the default and must render today's markup,
 * and stored data is validated against these exact strings. Appending is a
 * feature change; reordering or renaming is a data migration.
 */
describe('SECTION_VARIANTS registry', () => {
  it('covers every section type, and nothing else', () => {
    expect(Object.keys(SECTION_VARIANTS).sort()).toEqual(
      [...HOMEPAGE_SECTION_TYPES].sort(),
    )
  })

  it('pins the variant names each section type accepts', () => {
    expect(SECTION_VARIANTS).toEqual({
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
    })
  })

  it('gives every type at least one variant, with no duplicates', () => {
    for (const type of HOMEPAGE_SECTION_TYPES) {
      const variants: readonly string[] = SECTION_VARIANTS[type]
      expect(variants.length).toBeGreaterThan(0)
      expect(new Set(variants).size).toBe(variants.length)
    }
  })

  it('uses kebab-case names so they are safe as stored values and CSS hooks', () => {
    for (const type of HOMEPAGE_SECTION_TYPES) {
      for (const variant of SECTION_VARIANTS[type] as readonly string[]) {
        expect(variant).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
      }
    }
  })

  it('labels and describes every variant, and only real ones', () => {
    for (const type of HOMEPAGE_SECTION_TYPES) {
      const variants = [...(SECTION_VARIANTS[type] as readonly string[])].sort()
      const labels: Record<string, string> = VARIANT_LABELS[type]
      const descriptions: Record<string, string> = VARIANT_DESCRIPTIONS[type]
      expect(Object.keys(labels).sort()).toEqual(variants)
      expect(Object.keys(descriptions).sort()).toEqual(variants)
      for (const variant of variants) {
        expect(labels[variant].length).toBeGreaterThan(0)
        expect(descriptions[variant].length).toBeGreaterThan(0)
      }
    }
  })
})

describe('defaultVariant', () => {
  it('is the first entry for every type', () => {
    for (const type of HOMEPAGE_SECTION_TYPES) {
      expect(defaultVariant(type)).toBe(
        (SECTION_VARIANTS[type] as readonly string[])[0],
      )
    }
  })

  it('pins the defaults — these are the pre-variant renderings', () => {
    expect(defaultVariant('homepageHero')).toBe('classic')
    expect(defaultVariant('homepageSponsors')).toBe('tiers')
    expect(defaultVariant('homepageFaq')).toBe('accordion')
  })
})

describe('isSectionVariant', () => {
  it('accepts registered variants of that exact type only', () => {
    expect(isSectionVariant('homepageHero', 'emblem')).toBe(true)
    // 'shelf' is a real variant — of a DIFFERENT type.
    expect(isSectionVariant('homepageHero', 'shelf')).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isSectionVariant('homepageHero', undefined)).toBe(false)
    expect(isSectionVariant('homepageHero', null)).toBe(false)
    expect(isSectionVariant('homepageHero', 0)).toBe(false)
  })
})

describe('resolveVariant', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves an ABSENT variant to the default for every type — the back-compat path', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const type of HOMEPAGE_SECTION_TYPES) {
      expect(resolveVariant(type, undefined)).toBe(defaultVariant(type))
    }
    expect(warn).not.toHaveBeenCalled()
  })

  it('returns every registered variant unchanged, silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const type of HOMEPAGE_SECTION_TYPES) {
      for (const variant of SECTION_VARIANTS[type] as readonly string[]) {
        expect(resolveVariant(type, variant)).toBe(variant)
      }
    }
    expect(warn).not.toHaveBeenCalled()
  })

  it('falls back to the default for an unknown variant rather than dropping the section', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(resolveVariant('homepageHero', 'from-the-future')).toBe('classic')
    // A variant belonging to another section type is just as unknown here.
    expect(resolveVariant('homepageHero', 'logo-wall')).toBe('classic')
    expect(resolveVariant('homepageSponsors', '')).toBe('tiers')
  })

  it('warns once per (type, variant) pair, not once per render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    resolveVariant('homepageFaq', 'unknown-faq-a')
    resolveVariant('homepageFaq', 'unknown-faq-a')
    resolveVariant('homepageFaq', 'unknown-faq-a')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('unknown-faq-a')
    expect(warn.mock.calls[0][0]).toContain('homepageFaq')

    // A different variant on the same type warns again…
    resolveVariant('homepageFaq', 'unknown-faq-b')
    expect(warn).toHaveBeenCalledTimes(2)
    // …and so does the same variant name on a different type.
    resolveVariant('homepageVenue', 'unknown-faq-a')
    expect(warn).toHaveBeenCalledTimes(3)
  })
})

/**
 * Same hazard as `editor.ts` (see the twin test there): this module is reachable
 * from SERVER components via the render tree, and it is imported by the Sanity
 * Studio's Vite build by relative path. A single value import from any package —
 * even a pure helper — can put a client-only React context in the RSC module
 * graph, and the production build then dies collecting page data with
 * `createContext is not a function`. Invisible to typecheck and to every other
 * test, so it is asserted on the source text. `import type` is fine: it is erased.
 */
describe('server safety', () => {
  it('has no runtime import at all — not even a relative one', async () => {
    const { readFile } = await import('node:fs/promises')
    const source = await readFile(
      new URL('./variants.ts', import.meta.url),
      'utf8',
    )

    // Everything that is not `import type`. The back-edge to ./sections is
    // type-only by design, so this list must be empty: no package can sneak in,
    // and the sections.ts ↔ variants.ts cycle stays erased.
    const runtimeImports = Array.from(
      source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gm),
      (match) => match[1],
    )

    expect(runtimeImports).toEqual([])
  })
})

/** Type-level guard — a regression here fails the build, not the runner. */
describe('typing', () => {
  it('keeps the registry closed at the type level', () => {
    const type: HomepageSectionType = 'homepageGallery'
    const resolved: SectionVariant<'homepageGallery' | 'homepageHero'> =
      resolveVariant(type, 'mosaic') as SectionVariant<'homepageGallery'>
    expect(resolved).toBe('mosaic')

    // @ts-expect-error 'mosaic' is not a hero variant.
    const notAHeroVariant: SectionVariant<'homepageHero'> = 'mosaic'
    expect(notAHeroVariant).toBe('mosaic')
  })
})
