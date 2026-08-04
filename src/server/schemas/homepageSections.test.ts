import { describe, expect, it, vi } from 'vitest'
import { UpdateHomepageSectionsSchema } from './conference'
import { SECTION_VARIANTS, resolveVariant } from '@/lib/homepage/variants'

type SectionName = keyof typeof SECTION_VARIANTS

/**
 * The smallest payload each block type validates with — required copy only,
 * nothing optional. The key set is the registry's (`Record<SectionName, …>`),
 * so adding a 14th section type is a typecheck error here until it gets an
 * entry — and it is then covered by every table-driven test below.
 */
const MINIMAL: Record<SectionName, Record<string, unknown>> = {
  homepageHero: {},
  homepageSaveTheDate: {},
  homepageFeaturedSpeakers: {},
  homepageProgramHighlights: {},
  homepageOrganizers: {},
  homepageSponsors: {},
  homepageGallery: {},
  homepageMetrics: {},
  homepageCtaBanner: {
    heading: 'Join us',
    buttonLabel: 'Register',
    buttonHref: '/tickets',
  },
  homepageRichText: {
    content: [
      {
        _type: 'block',
        _key: 'b1',
        children: [{ _type: 'span', _key: 's1', text: 'Hi', marks: [] }],
      },
    ],
  },
  homepageFaq: {},
  homepageCountdown: {},
  homepageVenue: {},
}

const SECTION_NAMES = Object.keys(SECTION_VARIANTS) as SectionName[]

const parseSection = (_type: SectionName, extra: Record<string, unknown>) =>
  UpdateHomepageSectionsSchema.safeParse({
    homepageSections: [{ _type, _key: 'k', ...MINIMAL[_type], ...extra }],
  })

describe('UpdateHomepageSectionsSchema', () => {
  it('accepts an empty list (unsets → default layout)', () => {
    const parsed = UpdateHomepageSectionsSchema.parse({ homepageSections: [] })
    expect(parsed.homepageSections).toEqual([])
  })

  it('round-trips a full valid composition', () => {
    const input = {
      homepageSections: [
        { _type: 'homepageHero', _key: 'h', heroHeadline: 'Welcome' },
        { _type: 'homepageFeaturedSpeakers', _key: 'f', hidden: true },
        {
          _type: 'homepageCtaBanner',
          _key: 'c',
          heading: 'Join us',
          buttonLabel: 'Register',
          buttonHref: '/tickets',
        },
        {
          _type: 'homepageRichText',
          _key: 'r',
          content: [
            {
              _type: 'block',
              _key: 'b1',
              children: [{ _type: 'span', _key: 's1', text: 'Hi', marks: [] }],
            },
          ],
        },
      ],
    }
    const parsed = UpdateHomepageSectionsSchema.parse(input)
    expect(parsed.homepageSections).toHaveLength(4)
    expect(parsed.homepageSections[1]).toMatchObject({ hidden: true })
  })

  it('allows a hero with no overrides (stays smart by default)', () => {
    expect(() =>
      UpdateHomepageSectionsSchema.parse({
        homepageSections: [{ _type: 'homepageHero', _key: 'h' }],
      }),
    ).not.toThrow()
  })

  it('accepts hero CTA overrides', () => {
    const parsed = UpdateHomepageSectionsSchema.parse({
      homepageSections: [
        {
          _type: 'homepageHero',
          _key: 'h',
          ctaOverrides: [{ label: 'Tickets', href: '/tickets' }],
        },
      ],
    })
    const hero = parsed.homepageSections[0]
    expect(hero._type).toBe('homepageHero')
  })

  it('rejects unsafe link schemes on tenant-entered hrefs (site path or http(s) only)', () => {
    const withHref = (href: string) =>
      UpdateHomepageSectionsSchema.safeParse({
        homepageSections: [
          {
            _type: 'homepageHero',
            _key: 'h',
            ctaOverrides: [{ label: 'X', href }],
          },
        ],
      }).success
    expect(withHref('/tickets')).toBe(true)
    expect(withHref('https://example.com/register')).toBe(true)
    // eslint-disable-next-line no-script-url
    expect(withHref('javascript:alert(1)')).toBe(false)
    expect(withHref('data:text/html,x')).toBe(false)
    expect(withHref('//evil.example')).toBe(false)

    const bannerWith = (buttonHref: string) =>
      UpdateHomepageSectionsSchema.safeParse({
        homepageSections: [
          {
            _type: 'homepageCtaBanner',
            _key: 'b',
            heading: 'H',
            buttonLabel: 'Go',
            buttonHref,
          },
        ],
      }).success
    expect(bannerWith('/cfp')).toBe(true)
    // eslint-disable-next-line no-script-url
    expect(bannerWith('javascript:alert(1)')).toBe(false)
  })

  it('rejects an unknown section type (closed registry)', () => {
    expect(() =>
      UpdateHomepageSectionsSchema.parse({
        homepageSections: [{ _type: 'homepageRawHtml', _key: 'x' }],
      }),
    ).toThrow()
  })

  it('rejects a CTA banner missing its required copy', () => {
    expect(() =>
      UpdateHomepageSectionsSchema.parse({
        homepageSections: [
          { _type: 'homepageCtaBanner', _key: 'c', heading: 'Only heading' },
        ],
      }),
    ).toThrow()
  })

  it('keeps mailto: OUT of button links (only rich-text prose may use it)', () => {
    expect(() =>
      UpdateHomepageSectionsSchema.parse({
        homepageSections: [
          {
            _type: 'homepageCtaBanner',
            _key: 'c',
            heading: 'Ask us',
            buttonLabel: 'Email',
            buttonHref: 'mailto:hi@example.com',
          },
        ],
      }),
    ).toThrow()
  })

  it('rejects a rich-text block with no content', () => {
    expect(() =>
      UpdateHomepageSectionsSchema.parse({
        homepageSections: [
          { _type: 'homepageRichText', _key: 'r', content: [] },
        ],
      }),
    ).toThrow()
  })

  it('round-trips an FAQ block with own items', () => {
    const parsed = UpdateHomepageSectionsSchema.parse({
      homepageSections: [
        {
          _type: 'homepageFaq',
          _key: 'faq',
          heading: 'FAQ',
          source: 'own',
          items: [{ _key: 'i1', question: 'Q?', answer: 'A.' }],
        },
      ],
    })
    expect(parsed.homepageSections[0]).toMatchObject({
      _type: 'homepageFaq',
      source: 'own',
    })
  })

  it('accepts the FAQ ticketFaqs source toggle without items', () => {
    expect(() =>
      UpdateHomepageSectionsSchema.parse({
        homepageSections: [
          { _type: 'homepageFaq', _key: 'faq', source: 'ticketFaqs' },
        ],
      }),
    ).not.toThrow()
  })

  it('rejects an unknown FAQ source and a blank FAQ item', () => {
    expect(
      UpdateHomepageSectionsSchema.safeParse({
        homepageSections: [
          { _type: 'homepageFaq', _key: 'faq', source: 'somewhereElse' },
        ],
      }).success,
    ).toBe(false)
    expect(
      UpdateHomepageSectionsSchema.safeParse({
        homepageSections: [
          {
            _type: 'homepageFaq',
            _key: 'faq',
            items: [{ _key: 'i1', question: '', answer: 'A' }],
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('validates the countdown target override as a real date', () => {
    const withTarget = (targetOverride: string) =>
      UpdateHomepageSectionsSchema.safeParse({
        homepageSections: [
          { _type: 'homepageCountdown', _key: 'cd', targetOverride },
        ],
      }).success
    expect(withTarget('2099-09-15')).toBe(true)
    expect(withTarget('2099-09-15T09:00:00Z')).toBe(true)
    expect(withTarget('not-a-date')).toBe(false)
  })

  it('accepts a countdown with just a heading and live message', () => {
    expect(() =>
      UpdateHomepageSectionsSchema.parse({
        homepageSections: [
          {
            _type: 'homepageCountdown',
            _key: 'cd',
            heading: 'Starts in',
            liveMessage: 'We are live!',
          },
        ],
      }),
    ).not.toThrow()
  })

  it('round-trips per-section copy on the content bands', () => {
    const parsed = UpdateHomepageSectionsSchema.parse({
      homepageSections: [
        {
          _type: 'homepageGallery',
          _key: 'g',
          heading: 'Photos',
          description: 'From last year',
        },
        {
          _type: 'homepageFeaturedSpeakers',
          _key: 'f',
          heading: 'Our speakers',
          description: 'The line-up',
        },
        {
          _type: 'homepageOrganizers',
          _key: 'o',
          heading: 'The team',
          description: 'Volunteers, all of them',
        },
      ],
    })
    expect(parsed.homepageSections).toHaveLength(3)
    expect(parsed.homepageSections[0]).toMatchObject({ heading: 'Photos' })
  })

  it('round-trips the sponsors band copy and the CTA toggle', () => {
    const parsed = UpdateHomepageSectionsSchema.parse({
      homepageSections: [
        {
          _type: 'homepageSponsors',
          _key: 's',
          heading: 'Our partners',
          description: 'They make it possible',
          showCta: false,
          ctaHeading: 'Sponsor us',
          ctaDescription: 'Reach our audience.',
        },
      ],
    })
    expect(parsed.homepageSections[0]).toMatchObject({
      _type: 'homepageSponsors',
      showCta: false,
      ctaHeading: 'Sponsor us',
    })
  })

  it('still accepts the content bands with no copy at all (house defaults)', () => {
    expect(() =>
      UpdateHomepageSectionsSchema.parse({
        homepageSections: [
          { _type: 'homepageGallery', _key: 'g' },
          { _type: 'homepageFeaturedSpeakers', _key: 'f' },
          { _type: 'homepageOrganizers', _key: 'o' },
          { _type: 'homepageSponsors', _key: 's' },
        ],
      }),
    ).not.toThrow()
  })

  it('rejects blank section copy (absent is what selects the default)', () => {
    expect(
      UpdateHomepageSectionsSchema.safeParse({
        homepageSections: [
          { _type: 'homepageGallery', _key: 'g', heading: '' },
        ],
      }).success,
    ).toBe(false)
    expect(
      UpdateHomepageSectionsSchema.safeParse({
        homepageSections: [
          { _type: 'homepageSponsors', _key: 's', ctaDescription: '   ' },
        ],
      }).success,
    ).toBe(false)
  })

  it('strips unknown fields off a content band (no smuggled raw HTML)', () => {
    const parsed = UpdateHomepageSectionsSchema.parse({
      homepageSections: [
        {
          _type: 'homepageGallery',
          _key: 'g',
          heading: 'Photos',
          embedHtml: '<script>alert(1)</script>',
        },
      ],
    })
    expect(parsed.homepageSections[0]).not.toHaveProperty('embedHtml')
  })

  it('round-trips a venue block (name/address come from the conference)', () => {
    const parsed = UpdateHomepageSectionsSchema.parse({
      homepageSections: [
        {
          _type: 'homepageVenue',
          _key: 'v',
          heading: 'Venue',
          description: 'In the heart of Bergen.',
        },
      ],
    })
    expect(parsed.homepageSections[0]).toMatchObject({ _type: 'homepageVenue' })
  })

  it('round-trips a save-the-date block with optional copy', () => {
    const parsed = UpdateHomepageSectionsSchema.parse({
      homepageSections: [
        {
          _type: 'homepageSaveTheDate',
          _key: 'std',
          heading: 'Mark your calendar',
          description: 'Two days of cloud native in Bergen.',
        },
      ],
    })
    expect(parsed.homepageSections[0]).toMatchObject({
      _type: 'homepageSaveTheDate',
      heading: 'Mark your calendar',
    })
  })

  it('accepts a bare save-the-date block (all copy derived)', () => {
    const parsed = UpdateHomepageSectionsSchema.parse({
      homepageSections: [{ _type: 'homepageSaveTheDate', _key: 'std' }],
    })
    expect(parsed.homepageSections[0]).toEqual({
      _type: 'homepageSaveTheDate',
      _key: 'std',
    })
  })
})

/**
 * The WRITE half of the rich-text contract. The render-side sanitizer has its
 * own adversarial suite (`src/lib/homepage/richText.test.ts`); these assert the
 * other half — that a hostile payload is REFUSED at the boundary rather than
 * quietly cleaned, so an organizer sees an error instead of vanished content,
 * and so nothing unmodelled is ever written to a shared-dataset document.
 */
describe('UpdateHomepageSectionsSchema — rich text content', () => {
  const REAL_REF = `image-${'a'.repeat(40)}-1600x900-jpg`

  const withContent = (content: unknown) => ({
    homepageSections: [{ _type: 'homepageRichText', _key: 'r', content }],
  })

  const parseContent = (content: unknown) => {
    const parsed = UpdateHomepageSectionsSchema.parse(withContent(content))
    const section = parsed.homepageSections[0]
    if (section._type !== 'homepageRichText') throw new Error('wrong type')
    return section.content
  }

  const linked = (href: string) => [
    {
      _type: 'block',
      _key: 'b1',
      markDefs: [{ _type: 'link', _key: 'l1', href }],
      children: [{ _type: 'span', _key: 's1', text: 'x', marks: ['l1'] }],
    },
  ]

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html;base64,PHN2Zz48L3N2Zz4=',
    'vbscript:msgbox(1)',
    '//evil.example',
    'https:evil.example',
    'file:///etc/passwd',
  ])('rejects the link scheme %j at the boundary', (href) => {
    expect(() => parseContent(linked(href))).toThrow()
  })

  it.each(['/tickets', 'https://example.com/x', 'mailto:hi@example.com'])(
    'accepts the link %j',
    (href) => {
      expect(() => parseContent(linked(href))).not.toThrow()
    },
  )

  it.each(['html', 'rawHtml', 'script', 'iframe', 'embed', 'homepageHero'])(
    'rejects the unmodelled content type %j (the vocabulary is closed)',
    (type) => {
      expect(() =>
        parseContent([{ _type: type, _key: 'x', html: '<script></script>' }]),
      ).toThrow()
    },
  )

  it.each([
    ['a remote URL', 'https://evil.example/pixel.gif'],
    ['a data URL', 'data:image/svg+xml,<svg onload=alert(1)>'],
    ['an SVG asset', `image-${'a'.repeat(40)}-10x10-svg`],
    ['a file asset', `file-${'a'.repeat(40)}-pdf`],
    ['a traversal suffix', `image-${'a'.repeat(40)}-10x10-png/../x`],
  ])('rejects an image asset that is %s', (_label, ref) => {
    expect(() =>
      parseContent([
        { _type: 'richTextImage', _key: 'i', asset: { _ref: ref }, alt: '' },
      ]),
    ).toThrow()
  })

  it('accepts an image from our own asset pipeline', () => {
    const content = parseContent([
      {
        _type: 'richTextImage',
        _key: 'i',
        asset: { _type: 'reference', _ref: REAL_REF },
        alt: 'Venue',
        caption: 'Grieghallen',
      },
    ])
    expect(content[0]).toEqual({
      _type: 'richTextImage',
      _key: 'i',
      asset: { _type: 'reference', _ref: REAL_REF },
      alt: 'Venue',
      caption: 'Grieghallen',
    })
  })

  it('stores only modelled keys — smuggled fields never reach the document', () => {
    const content = parseContent([
      {
        _type: 'richTextCode',
        _key: 'c',
        language: 'yaml',
        code: 'kind: Venue',
        onload: 'alert(1)',
        html: '<script>alert(1)</script>',
        className: 'fixed inset-0',
      },
    ])
    expect(Object.keys(content[0]).sort()).toEqual([
      '_key',
      '_type',
      'code',
      'language',
    ])
  })

  it('accepts the full vocabulary in one block', () => {
    const content = parseContent([
      {
        _type: 'block',
        _key: 'b',
        style: 'h2',
        markDefs: [],
        children: [{ _type: 'span', _key: 's', text: 'Venue', marks: [] }],
      },
      {
        _type: 'richTextCode',
        _key: 'c',
        language: 'yaml',
        code: 'kind: Venue',
      },
      {
        _type: 'richTextImage',
        _key: 'i',
        asset: { _type: 'reference', _ref: REAL_REF },
      },
      {
        _type: 'richTextTable',
        _key: 't',
        headerRow: true,
        rows: [
          { _key: 'r1', cells: ['Room', 'Track'] },
          { _key: 'r2', cells: ['A', 'Platform'] },
        ],
      },
      {
        _type: 'richTextCallout',
        _key: 'k',
        tone: 'warning',
        body: 'Sold out',
      },
    ])
    expect(content.map((b) => b._type)).toEqual([
      'block',
      'richTextCode',
      'richTextImage',
      'richTextTable',
      'richTextCallout',
    ])
  })

  it('rejects content that would render nothing at all', () => {
    expect(() =>
      parseContent([{ _type: 'block', _key: 'b', children: [] }]),
    ).toThrow()
  })

  it('rejects a payload past the size ceilings', () => {
    expect(() =>
      parseContent([
        { _type: 'richTextCode', _key: 'c', code: 'a'.repeat(20_001) },
      ]),
    ).toThrow()
    expect(() =>
      parseContent(
        Array.from({ length: 201 }, (_, i) => ({
          _type: 'block',
          _key: `b${i}`,
          children: [{ _type: 'span', _key: 's', text: 'x', marks: [] }],
        })),
      ),
    ).toThrow()
  })
})

/**
 * The VARIANT half of the write path. The registry
 * (`src/lib/homepage/variants.ts`) is the single source of truth, so these are
 * driven off `SECTION_VARIANTS` itself rather than a hand-written list: a new
 * section type or a new variant is covered the moment it lands in the table,
 * and a union member that FORGOT its `variant` field fails here (zod strips
 * unknown keys, so the value would validate and then silently never arrive —
 * the exact class of bug this suite exists to catch).
 */
describe('UpdateHomepageSectionsSchema — section variants', () => {
  it('covers every registered section type', () => {
    expect(SECTION_NAMES).toHaveLength(13)
  })

  it.each(SECTION_NAMES)(
    '%s accepts every variant in the registry and carries it through',
    (name) => {
      for (const variant of SECTION_VARIANTS[name]) {
        const parsed = parseSection(name, { variant })
        expect(parsed.success).toBe(true)
        // Not merely "accepted" — PRESENT after parsing. A member missing its
        // `variant` field parses fine and drops the value on the floor.
        expect(parsed.success && parsed.data.homepageSections[0]).toMatchObject(
          {
            _type: name,
            variant,
          },
        )
      }
    },
  )

  it.each(SECTION_NAMES)(
    '%s rejects a variant that is not in its list (closed enum)',
    (name) => {
      expect(parseSection(name, { variant: 'no-such-variant' }).success).toBe(
        false,
      )
      // …including one invented by a NEWER deploy: the write path refuses to
      // store a name this build has no markup for.
      expect(parseSection(name, { variant: 'holographic' }).success).toBe(false)
    },
  )

  it.each(SECTION_NAMES)(
    "%s rejects another type's variant (the lists are per-type, not global)",
    (name) => {
      const own = new Set<string>(SECTION_VARIANTS[name])
      const foreign = SECTION_NAMES.flatMap(
        (other) => SECTION_VARIANTS[other] as readonly string[],
      ).find((variant) => !own.has(variant))
      expect(foreign).toBeDefined()
      expect(parseSection(name, { variant: foreign }).success).toBe(false)
    },
  )

  it.each(SECTION_NAMES)(
    '%s is still valid with no variant at all (absent = the default look)',
    (name) => {
      const parsed = parseSection(name, {})
      expect(parsed.success).toBe(true)
      expect(
        parsed.success && parsed.data.homepageSections[0],
      ).not.toHaveProperty('variant')
    },
  )

  it.each(SECTION_NAMES)(
    '%s rejects an empty-string variant (absent is the only spelling of "default")',
    (name) => {
      expect(parseSection(name, { variant: '' }).success).toBe(false)
    },
  )

  /**
   * The two halves of the contract disagree ON PURPOSE, so assert both here,
   * side by side, rather than trusting a comment:
   *
   *  - WRITE rejects an unknown variant. The only writer is our own editor,
   *    driven by this same registry, so an out-of-list value is a stale client
   *    or a bug, and storing it would put an unrenderable name into a tenant's
   *    document.
   *  - RENDER (`resolveVariant`) tolerates it, falling back to the default with
   *    a warn-once. There the value is ALREADY stored — written by a newer
   *    deploy during a rollout — and skipping would blank a section whose
   *    content is perfectly valid.
   */
  it('rejects on write what the renderer tolerates on read (deliberate asymmetry)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const fromTheFuture = 'kaleidoscope'
      expect(
        parseSection('homepageHero', { variant: fromTheFuture }).success,
      ).toBe(false)
      expect(resolveVariant('homepageHero', fromTheFuture)).toBe('classic')
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})
