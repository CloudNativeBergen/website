import { describe, expect, it } from 'vitest'
import {
  EditorRow,
  isConfigurable,
  moveByIndex,
  reorderByKey,
  serializeRows,
  toEditorRows,
  toPayload,
  toPreviewBands,
} from './editor'
import type { HomepageSection } from './sections'

const rows: EditorRow[] = [
  { _key: 'a', _type: 'homepageHero' },
  { _key: 'b', _type: 'homepageGallery' },
  { _key: 'c', _type: 'homepageSponsors' },
]

describe('moveByIndex', () => {
  it('moves an item up', () => {
    expect(moveByIndex(rows, 1, 0).map((r) => r._key)).toEqual(['b', 'a', 'c'])
  })

  it('moves an item down', () => {
    expect(moveByIndex(rows, 0, 1).map((r) => r._key)).toEqual(['b', 'a', 'c'])
  })

  it('is a no-op past the top edge', () => {
    expect(moveByIndex(rows, 0, -1)).toBe(rows)
  })

  it('is a no-op past the bottom edge', () => {
    expect(moveByIndex(rows, 2, 3)).toBe(rows)
  })

  it('does not mutate the input', () => {
    const copy = rows.slice()
    moveByIndex(rows, 0, 2)
    expect(rows).toEqual(copy)
  })
})

describe('reorderByKey', () => {
  it('reorders by key', () => {
    expect(reorderByKey(rows, 'a', 'c').map((r) => r._key)).toEqual([
      'b',
      'c',
      'a',
    ])
  })

  it('is a no-op when active equals over', () => {
    expect(reorderByKey(rows, 'b', 'b')).toBe(rows)
  })

  it('is a no-op with a null active or over (mid-drag, no target yet)', () => {
    expect(reorderByKey(rows, 'a', null)).toBe(rows)
    expect(reorderByKey(rows, null, 'a')).toBe(rows)
  })

  it('is a no-op for unknown keys', () => {
    expect(reorderByKey(rows, 'a', 'zzz')).toBe(rows)
  })
})

describe('isConfigurable', () => {
  it('is true for blocks with a config form', () => {
    expect(isConfigurable('homepageHero')).toBe(true)
    expect(isConfigurable('homepageCtaBanner')).toBe(true)
    expect(isConfigurable('homepageRichText')).toBe(true)
    expect(isConfigurable('homepageMetrics')).toBe(true)
  })

  it('is false for content-free blocks', () => {
    expect(isConfigurable('homepageGallery')).toBe(false)
    expect(isConfigurable('homepageSponsors')).toBe(false)
    expect(isConfigurable('homepageFeaturedSpeakers')).toBe(false)
    expect(isConfigurable('homepageProgramHighlights')).toBe(false)
    expect(isConfigurable('homepageOrganizers')).toBe(false)
  })
})

describe('serializeRows', () => {
  it('is stable regardless of transient field values that are trimmed away', () => {
    const a: EditorRow[] = [{ _key: 'a', _type: 'homepageHero' }]
    const b: EditorRow[] = [
      { _key: 'a', _type: 'homepageHero', heroHeadline: '   ' },
    ]
    expect(serializeRows(a)).toBe(serializeRows(b))
  })

  it('differs once a section is reordered', () => {
    expect(serializeRows(rows)).not.toBe(
      serializeRows(reorderByKey(rows, 'a', 'c')),
    )
  })

  it('differs once a section is hidden', () => {
    const hidden = rows.map((r) =>
      r._key === 'b' ? { ...r, hidden: true } : r,
    )
    expect(serializeRows(rows)).not.toBe(serializeRows(hidden))
  })
})

describe('toPreviewBands', () => {
  const defaultSections: HomepageSection[] = [
    { _key: 'default-hero', _type: 'homepageHero' },
    { _key: 'default-gallery', _type: 'homepageGallery' },
    { _key: 'default-program', _type: 'homepageProgramHighlights' },
    { _key: 'default-sponsors', _type: 'homepageSponsors' },
  ]

  it('maps rows to labeled bands in order', () => {
    const bands = toPreviewBands(toEditorRows(defaultSections), true)
    expect(bands.map((b) => b.label)).toEqual([
      'Hero',
      'Photo Gallery',
      'Program Highlights',
      'Sponsors',
    ])
  })

  it('marks the phase-dependent middle slot only when using the default layout', () => {
    const editorRows = toEditorRows(defaultSections)
    const asDefault = toPreviewBands(editorRows, true)
    expect(
      asDefault.find((b) => b.key === 'default-program')?.isPhaseSlot,
    ).toBe(true)
    expect(asDefault.find((b) => b.key === 'default-hero')?.isPhaseSlot).toBe(
      false,
    )

    const asCustom = toPreviewBands(editorRows, false)
    expect(asCustom.every((b) => !b.isPhaseSlot)).toBe(true)
  })

  it('marks the featured-speakers and organizers fallbacks as the phase slot', () => {
    const featured = toEditorRows([
      { _key: 'default-featured-speakers', _type: 'homepageFeaturedSpeakers' },
    ])
    expect(toPreviewBands(featured, true)[0].isPhaseSlot).toBe(true)

    const organizers = toEditorRows([
      { _key: 'default-organizers', _type: 'homepageOrganizers' },
    ])
    expect(toPreviewBands(organizers, true)[0].isPhaseSlot).toBe(true)
  })

  it('does not mark a manually added featured-speakers block as the phase slot', () => {
    const manual = toEditorRows([
      { _key: 'hp-manual-1', _type: 'homepageFeaturedSpeakers' },
    ])
    expect(toPreviewBands(manual, true)[0].isPhaseSlot).toBe(false)
  })

  it('ghosts hidden sections', () => {
    const withHidden: HomepageSection[] = [
      { _key: 'hero', _type: 'homepageHero' },
      { _key: 'gallery', _type: 'homepageGallery', hidden: true },
    ]
    const bands = toPreviewBands(toEditorRows(withHidden), false)
    expect(bands[0].hidden).toBe(false)
    expect(bands[1].hidden).toBe(true)
  })
})

describe('toPayload — mapping semantics', () => {
  it('trims hero copy, omits blank optionals, and filters incomplete CTA overrides', () => {
    const [hero] = toPayload([
      {
        _key: 'h',
        _type: 'homepageHero',
        heroHeadline: '  Hello  ',
        heroSubheadline: '   ',
        ctaOverrides: [
          { _key: 'c1', label: ' Tickets ', href: ' /tickets ' },
          { _key: 'c2', label: '  ', href: '/cfp' },
          { _key: 'c3', label: 'CFP', href: '  ' },
        ],
      },
    ])
    expect(hero.heroHeadline).toBe('Hello')
    // Blank subheadline is OMITTED, not sent as ''.
    expect('heroSubheadline' in hero).toBe(false)
    // Only the complete override survives, trimmed.
    expect(hero.ctaOverrides).toEqual([
      { _key: 'c1', label: 'Tickets', href: '/tickets' },
    ])
  })

  it('keeps CTA-banner required fields present (server rejects empties with its own messages)', () => {
    const [banner] = toPayload([
      {
        _key: 'b',
        _type: 'homepageCtaBanner',
        heading: ' Go ',
        body: '   ',
        buttonLabel: 'Now',
        buttonHref: '/x',
      },
    ])
    expect(banner.heading).toBe('Go')
    expect('body' in banner).toBe(false)
    expect(banner.buttonLabel).toBe('Now')
    expect(banner.buttonHref).toBe('/x')
  })

  it('maps rich-text content through verbatim and defaults to an empty array', () => {
    const block = { _type: 'block', _key: 'p1', children: [] }
    const [withContent, without] = toPayload([
      { _key: 'r1', _type: 'homepageRichText', content: [block] as never },
      { _key: 'r2', _type: 'homepageRichText' },
    ])
    expect(withContent.content).toEqual([block])
    expect(without.content).toEqual([])
  })

  it('round-trips toEditorRows → toPayload for a stored composition (keys and flags preserved)', () => {
    const stored = [
      { _key: 's1', _type: 'homepageHero' as const, heroHeadline: 'Hi' },
      { _key: 's2', _type: 'homepageSponsors' as const, hidden: true },
    ]
    const payload = toPayload(toEditorRows(stored as never))
    expect(payload[0]).toMatchObject({
      _key: 's1',
      _type: 'homepageHero',
      heroHeadline: 'Hi',
    })
    expect(payload[1]).toEqual({
      _key: 's2',
      _type: 'homepageSponsors',
      hidden: true,
    })
  })
})
