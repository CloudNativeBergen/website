import { describe, expect, it } from 'vitest'
import {
  EditorRow,
  isConfigurable,
  isoToLocalInput,
  localInputToIso,
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

  it('is true for the content bands that carry only copy config', () => {
    expect(isConfigurable('homepageGallery')).toBe(true)
    expect(isConfigurable('homepageSponsors')).toBe(true)
    expect(isConfigurable('homepageFeaturedSpeakers')).toBe(true)
    expect(isConfigurable('homepageOrganizers')).toBe(true)
  })

  it('is false for the block with nothing to configure', () => {
    expect(isConfigurable('homepageProgramHighlights')).toBe(false)
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

describe('toEditorRows — new F4 blocks', () => {
  it('maps a FAQ block with own items (source defaults to own)', () => {
    const sections: HomepageSection[] = [
      {
        _key: 'faq',
        _type: 'homepageFaq',
        heading: 'Questions',
        items: [{ _key: 'i1', question: 'Q1', answer: 'A1' }],
      },
    ]
    const [row] = toEditorRows(sections)
    expect(row.source).toBe('own')
    expect(row.faqItems).toEqual([{ _key: 'i1', question: 'Q1', answer: 'A1' }])
  })

  it('preserves the ticketFaqs source toggle', () => {
    const [row] = toEditorRows([
      { _key: 'faq', _type: 'homepageFaq', source: 'ticketFaqs' },
    ])
    expect(row.source).toBe('ticketFaqs')
    expect(row.faqItems).toEqual([])
  })

  it('maps countdown and venue fields', () => {
    const rows = toEditorRows([
      {
        _key: 'cd',
        _type: 'homepageCountdown',
        heading: 'Starts in',
        targetOverride: '2099-09-15T10:00:00.000Z',
        liveMessage: 'We are live!',
      },
      {
        _key: 'v',
        _type: 'homepageVenue',
        heading: 'Where',
        description: 'Downtown',
      },
    ])
    expect(rows[0]).toMatchObject({
      // Stored ISO instants surface as LOCAL wall-clock datetime-local values
      // (round-tripped back to ISO by toPayload below).
      targetOverride: isoToLocalInput('2099-09-15T10:00:00.000Z'),
      liveMessage: 'We are live!',
    })
    expect(rows[1]).toMatchObject({ heading: 'Where', description: 'Downtown' })
  })
})

describe('toPayload — trimming, omission and item filtering', () => {
  it('stores own FAQ items (trimmed) and drops blank ones', () => {
    const rows: EditorRow[] = [
      {
        _key: 'faq',
        _type: 'homepageFaq',
        heading: '  Questions  ',
        source: 'own',
        faqItems: [
          { _key: 'i1', question: '  Q1  ', answer: '  A1  ' },
          { _key: 'i2', question: '', answer: 'orphan' },
        ],
      },
    ]
    const [out] = toPayload(rows)
    expect(out.heading).toBe('Questions')
    expect(out.items).toEqual([{ _key: 'i1', question: 'Q1', answer: 'A1' }])
    expect(out.source).toBeUndefined() // 'own' is implicit
  })

  it('stores the ticketFaqs source and omits items entirely', () => {
    const [out] = toPayload([
      {
        _key: 'faq',
        _type: 'homepageFaq',
        source: 'ticketFaqs',
        faqItems: [{ _key: 'i1', question: 'ignored', answer: 'ignored' }],
      },
    ])
    expect(out.source).toBe('ticketFaqs')
    expect(out.items).toBeUndefined()
  })

  it('omits blank countdown/venue optionals but keeps set ones', () => {
    const [cd, venue] = toPayload([
      {
        _key: 'cd',
        _type: 'homepageCountdown',
        heading: '   ',
        targetOverride: '2099-09-15T10:00:00.000Z',
        liveMessage: '  ',
      },
      { _key: 'v', _type: 'homepageVenue', description: 'Grieghallen' },
    ])
    expect(cd.heading).toBeUndefined()
    expect(cd.liveMessage).toBeUndefined()
    expect(cd.targetOverride).toBe(
      localInputToIso(isoToLocalInput('2099-09-15T10:00:00.000Z')),
    )
    expect(venue.heading).toBeUndefined()
    expect(venue.description).toBe('Grieghallen')
  })

  it('maps the content bands’ copy overrides in both directions', () => {
    const stored: HomepageSection[] = [
      {
        _key: 'g',
        _type: 'homepageGallery',
        heading: 'Photos',
        description: 'From last year',
      },
      {
        _key: 'f',
        _type: 'homepageFeaturedSpeakers',
        heading: 'Our speakers',
      },
      {
        _key: 'o',
        _type: 'homepageOrganizers',
        description: 'The crew',
      },
    ]
    const editorRows = toEditorRows(stored)
    expect(editorRows[0]).toMatchObject({
      heading: 'Photos',
      description: 'From last year',
    })
    const [gallery, featured, organizers] = toPayload(editorRows)
    expect(gallery).toEqual({
      _key: 'g',
      _type: 'homepageGallery',
      heading: 'Photos',
      description: 'From last year',
    })
    expect(featured).toEqual({
      _key: 'f',
      _type: 'homepageFeaturedSpeakers',
      heading: 'Our speakers',
    })
    expect(organizers).toEqual({
      _key: 'o',
      _type: 'homepageOrganizers',
      description: 'The crew',
    })
  })

  it('serializes an unconfigured sponsors block to bare _type/_key (zero migration)', () => {
    const [out] = toPayload(
      toEditorRows([{ _key: 's', _type: 'homepageSponsors' }]),
    )
    expect(out).toEqual({ _key: 's', _type: 'homepageSponsors' })
  })

  it('stores sponsors CTA copy and only the non-default hidden-CTA state', () => {
    const [shown, hiddenCta] = toPayload([
      {
        _key: 's1',
        _type: 'homepageSponsors',
        showCta: true,
        ctaHeading: '  Sponsor us  ',
        ctaDescription: '  Reach our audience.  ',
      },
      {
        _key: 's2',
        _type: 'homepageSponsors',
        showCta: false,
        ctaHeading: 'ignored but kept as a draft in the form',
      },
    ])
    expect(shown).toEqual({
      _key: 's1',
      _type: 'homepageSponsors',
      ctaHeading: 'Sponsor us',
      ctaDescription: 'Reach our audience.',
    })
    expect(hiddenCta).toMatchObject({ showCta: false })
  })

  it('round-trips a hidden sponsors CTA through the editor rows', () => {
    const [row] = toEditorRows([
      { _key: 's', _type: 'homepageSponsors', showCta: false },
    ])
    expect(row.showCta).toBe(false)
    expect(toPayload([row])[0]).toEqual({
      _key: 's',
      _type: 'homepageSponsors',
      showCta: false,
    })
  })

  it('always carries _type and _key, plus hidden when set', () => {
    const [out] = toPayload([
      { _key: 'v', _type: 'homepageVenue', hidden: true },
    ])
    expect(out).toMatchObject({
      _type: 'homepageVenue',
      _key: 'v',
      hidden: true,
    })
  })
})
