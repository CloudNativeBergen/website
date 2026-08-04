import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FAQ_HEADING,
  DEFAULT_FEATURED_SPEAKERS_HEADING,
  DEFAULT_GALLERY_DESCRIPTION,
  DEFAULT_GALLERY_HEADING,
  DEFAULT_ORGANIZERS_HEADING,
  DEFAULT_SAVE_THE_DATE_HEADING,
  DEFAULT_SPONSORS_CTA_HEADING,
  DEFAULT_SPONSORS_HEADING,
  DEFAULT_VENUE_HEADING,
  defaultFeaturedSpeakersDescription,
  defaultOrganizersDescription,
} from '@/lib/homepage/sections'
import {
  BODY_EXCERPT,
  composerPlaceholders,
  excerpt,
  HEADING_EXCERPT,
} from './placeholderCopy'

const conference = {
  title: 'Nordic Platform Days',
  tagline: 'The conference for the people who run the platform',
  description:
    'A community conference for platform engineers, SREs and everyone who keeps production up.',
}

describe('excerpt', () => {
  it('leaves text that already fits untouched — no ellipsis on a whole string', () => {
    expect(excerpt('Featured Speakers', HEADING_EXCERPT)).toBe(
      'Featured Speakers',
    )
  })

  it('cuts a long paragraph at a word boundary and marks it', () => {
    const short = excerpt(DEFAULT_GALLERY_DESCRIPTION, BODY_EXCERPT)
    expect(short.length).toBeLessThanOrEqual(BODY_EXCERPT + 1)
    expect(short.endsWith('…')).toBe(true)
    // The excerpt is a PREFIX of the real fallback, never a paraphrase of it.
    expect(DEFAULT_GALLERY_DESCRIPTION.startsWith(short.slice(0, -1))).toBe(
      true,
    )
    expect(short).not.toMatch(/[ ,.]…$/)
  })

  it('hard-cuts a single word with no boundary to break on', () => {
    expect(excerpt('a'.repeat(40), 10)).toBe(`${'a'.repeat(10)}…`)
  })

  it('collapses newlines so a multi-line default stays one line of placeholder', () => {
    expect(excerpt('Two\nlines', HEADING_EXCERPT)).toBe('Two lines')
  })
})

describe('composerPlaceholders', () => {
  it('quotes the house constants the bands actually render', () => {
    const p = composerPlaceholders(conference)
    expect(p.homepageFaq.heading).toBe(DEFAULT_FAQ_HEADING)
    expect(p.homepageSaveTheDate.heading).toBe(DEFAULT_SAVE_THE_DATE_HEADING)
    expect(p.homepageVenue.heading).toBe(DEFAULT_VENUE_HEADING)
    expect(p.homepageGallery.heading).toBe(DEFAULT_GALLERY_HEADING)
    expect(p.homepageSponsors.heading).toBe(DEFAULT_SPONSORS_HEADING)
    expect(p.homepageSponsors.ctaHeading).toBe(DEFAULT_SPONSORS_CTA_HEADING)
    expect(p.homepageFeaturedSpeakers.heading).toBe(
      DEFAULT_FEATURED_SPEAKERS_HEADING,
    )
    expect(p.homepageOrganizers.heading).toBe(DEFAULT_ORGANIZERS_HEADING)
  })

  it('renders the computed intros with THIS conference, not a template', () => {
    const p = composerPlaceholders(conference)
    expect(p.homepageFeaturedSpeakers.description).toBe(
      defaultFeaturedSpeakersDescription('Nordic Platform Days'),
    )
    expect(p.homepageOrganizers.description).toBe(
      defaultOrganizersDescription('Nordic Platform Days'),
    )
    expect(p.homepageFeaturedSpeakers.description).not.toContain('{')
  })

  it('shows the hero its own fallbacks — the tagline and the description', () => {
    const p = composerPlaceholders(conference)
    expect(p.homepageHero.heroHeadline).toBe(
      excerpt(conference.tagline, HEADING_EXCERPT),
    )
    expect(conference.tagline).toContain(
      p.homepageHero.heroHeadline.replace('…', ''),
    )
    expect(p.homepageHero.heroSubheadline).toBe(
      excerpt(conference.description, BODY_EXCERPT),
    )
  })

  it('says nothing renders where the tenant has nothing to fall back to', () => {
    const p = composerPlaceholders({ title: 'Day One Conf' })
    expect(p.homepageHero.heroHeadline).toMatch(/^No headline —/)
    expect(p.homepageHero.heroSubheadline).toMatch(/^No text —/)
  })

  it('does not invent a fallback for fields the page renders nothing for', () => {
    const p = composerPlaceholders(conference)
    expect(p.homepageMetrics.heading).toMatch(/^No heading —/)
    expect(p.homepageCountdown.heading).toMatch(/^No heading —/)
    expect(p.homepageRichText.heading).toMatch(/^No heading —/)
    expect(p.homepageCountdown.liveMessage).toMatch(/^No message —/)
    expect(p.homepageCtaBanner.body).toMatch(/^No body —/)
    expect(p.homepageVenue.description).toMatch(/^No description —/)
    expect(p.homepageSaveTheDate.description).toMatch(/^No extra line —/)
  })

  it('names the conference generically while the tenant query is in flight', () => {
    const p = composerPlaceholders()
    expect(p.homepageFeaturedSpeakers.description).toBe(
      defaultFeaturedSpeakersDescription('your conference'),
    )
    expect(p.homepageHero.heroHeadline).toMatch(/^No headline —/)
  })

  it('ignores a Portable Text description — the hero only renders a string', () => {
    const p = composerPlaceholders({
      title: 'Nordic Platform Days',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      description: [{ _type: 'block' }] as any,
    })
    expect(p.homepageHero.heroSubheadline).toMatch(/^No text —/)
  })
})
