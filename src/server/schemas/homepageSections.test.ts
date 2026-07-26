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
})
