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
})
