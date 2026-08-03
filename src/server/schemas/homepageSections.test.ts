import { describe, expect, it } from 'vitest'
import { UpdateHomepageSectionsSchema } from './conference'

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
          content: [{ _type: 'block', _key: 'b1', children: [] }],
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
