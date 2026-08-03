/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// Stub every leaf component the renderer maps to, so the test verifies the
// mapping/order/skip logic — not the (separately tested) leaf components.
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock('@/components/Hero', () => ({
  Hero: () => <div data-testid="hero" />,
}))
vi.mock('@/components/ProgramHighlights', () => ({
  ProgramHighlights: () => <div data-testid="program" />,
}))
vi.mock('@/components/Sponsors', () => ({
  Sponsors: ({
    showCTA,
    heading,
    ctaHeading,
  }: {
    showCTA?: boolean
    heading?: string
    ctaHeading?: string
  }) => (
    <div
      data-testid="sponsors"
      data-show-cta={String(showCTA)}
      data-heading={heading ?? ''}
      data-cta-heading={ctaHeading ?? ''}
    />
  ),
}))
vi.mock('@/components/ImageGallery', () => ({
  ImageGallery: ({
    heading,
    description,
  }: {
    heading?: string
    description?: string
  }) => (
    <div
      data-testid="gallery"
      data-heading={heading ?? ''}
      data-description={description ?? ''}
    />
  ),
}))
vi.mock('@/components/FeaturedSpeakersShelf', () => ({
  FeaturedSpeakersShelf: () => <div data-testid="featured-shelf" />,
}))
vi.mock('@/components/SpeakerPromotionCard', () => ({
  SpeakerPromotionCard: () => <div data-testid="organizer-card" />,
}))
vi.mock('@/components/homepage/CtaBanner', () => ({
  CtaBanner: () => <div data-testid="cta-banner" />,
}))
vi.mock('@/components/homepage/RichTextBlock', () => ({
  RichTextBlock: () => <div data-testid="rich-text" />,
}))
vi.mock('@/components/homepage/MetricsBlock', () => ({
  MetricsBlock: () => <div data-testid="metrics" />,
}))
vi.mock('@/components/homepage/FaqBlock', () => ({
  FaqBlock: () => <div data-testid="faq" />,
}))
vi.mock('@/components/homepage/Countdown', () => ({
  Countdown: ({ targetMs }: { targetMs: number }) => (
    <div data-testid="countdown" data-target={targetMs} />
  ),
}))
vi.mock('@/components/homepage/VenueBlock', () => ({
  VenueBlock: () => <div data-testid="venue" />,
}))

import { HomepageSectionRenderer } from './SectionRenderer'
import { getDefaultSections, type HomepageSection } from '@/lib/homepage'
import type { Conference } from '@/lib/conference/types'

function makeConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conf-1',
    title: 'Test Conf',
    programDate: '2000-01-01',
    endDate: '2999-01-01',
    registrationEnabled: false,
    schedules: [{ _id: 's1' }],
    featuredSpeakers: [{ _id: 'sp1', name: 'Speaker' }],
    organizers: [{ _id: 'o1', name: 'Org' }],
    featuredGalleryImages: [{ _id: 'g1' }],
    vanityMetrics: [{ label: 'A', value: '1' }],
    sponsors: [],
    ...overrides,
  } as unknown as Conference
}

afterEach(cleanup)

function testIdsInOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid]')).map((el) =>
    el.getAttribute('data-testid')!,
  )
}

describe('HomepageSectionRenderer — default composition', () => {
  it('renders every default section in order (schedule-published phase)', () => {
    const conference = makeConference()
    const { container } = render(
      <HomepageSectionRenderer
        sections={getDefaultSections(conference)}
        conference={conference}
      />,
    )
    expect(testIdsInOrder(container)).toEqual([
      'hero',
      'gallery',
      'program',
      'sponsors',
    ])
  })

  it('uses the featured-speakers slot when no schedule is published', () => {
    const conference = makeConference({
      programDate: '2999-01-01',
      schedules: [],
    })
    const { container } = render(
      <HomepageSectionRenderer
        sections={getDefaultSections(conference)}
        conference={conference}
      />,
    )
    const ids = testIdsInOrder(container)
    expect(ids[0]).toBe('hero')
    expect(ids).toContain('featured-shelf')
    expect(ids).not.toContain('program')
  })
})

describe('HomepageSectionRenderer — per-section copy', () => {
  it('renders the house copy when a section configures none', () => {
    const conference = makeConference({
      programDate: '2999-01-01',
      schedules: [],
    })
    const { container } = render(
      <HomepageSectionRenderer
        sections={[
          { _key: 'g', _type: 'homepageGallery' },
          { _key: 'f', _type: 'homepageFeaturedSpeakers' },
          { _key: 's', _type: 'homepageSponsors' },
        ]}
        conference={conference}
      />,
    )
    // The inline bands render their defaults verbatim…
    expect(container.textContent).toContain('Featured Speakers')
    expect(container.textContent).toContain('Meet the speakers at Test Conf')
    // …and the leaf components are handed NOTHING, so their own prop defaults
    // (today's copy) apply — this is the zero-migration guarantee.
    const gallery = container.querySelector('[data-testid="gallery"]')!
    expect(gallery.getAttribute('data-heading')).toBe('')
    expect(gallery.getAttribute('data-description')).toBe('')
    const sponsors = container.querySelector('[data-testid="sponsors"]')!
    expect(sponsors.getAttribute('data-heading')).toBe('')
    expect(sponsors.getAttribute('data-cta-heading')).toBe('')
    expect(sponsors.getAttribute('data-show-cta')).toBe('true')
  })

  it('renders configured copy for the inline bands', () => {
    const conference = makeConference({
      programDate: '2999-01-01',
      schedules: [],
    })
    const { container } = render(
      <HomepageSectionRenderer
        sections={[
          {
            _key: 'f',
            _type: 'homepageFeaturedSpeakers',
            heading: 'Who you will hear',
            description: 'A hand-picked line-up',
          },
          {
            _key: 'o',
            _type: 'homepageOrganizers',
            heading: 'The crew',
            description: 'Volunteers, all of them',
          },
        ]}
        conference={conference}
      />,
    )
    expect(container.textContent).toContain('Who you will hear')
    expect(container.textContent).toContain('A hand-picked line-up')
    expect(container.textContent).not.toContain('Featured Speakers')
    expect(container.textContent).toContain('The crew')
    expect(container.textContent).not.toContain('Meet Our Organizers')
  })

  it('passes configured copy and the CTA toggle down to the leaf components', () => {
    const conference = makeConference()
    const { container } = render(
      <HomepageSectionRenderer
        sections={[
          { _key: 'g', _type: 'homepageGallery', heading: 'Photos' },
          {
            _key: 's',
            _type: 'homepageSponsors',
            heading: 'Our partners',
            showCta: false,
            ctaHeading: 'ignored while hidden',
          },
        ]}
        conference={conference}
      />,
    )
    expect(
      container
        .querySelector('[data-testid="gallery"]')
        ?.getAttribute('data-heading'),
    ).toBe('Photos')
    const sponsors = container.querySelector('[data-testid="sponsors"]')!
    expect(sponsors.getAttribute('data-heading')).toBe('Our partners')
    expect(sponsors.getAttribute('data-show-cta')).toBe('false')
  })

  it('treats blank stored copy as absent (falls back to the default)', () => {
    const conference = makeConference({
      programDate: '2999-01-01',
      schedules: [],
    })
    const { container } = render(
      <HomepageSectionRenderer
        sections={[
          { _key: 'g', _type: 'homepageGallery', heading: '   ' },
          { _key: 'f', _type: 'homepageFeaturedSpeakers', heading: '  ' },
        ]}
        conference={conference}
      />,
    )
    expect(
      container
        .querySelector('[data-testid="gallery"]')
        ?.getAttribute('data-heading'),
    ).toBe('')
    expect(container.textContent).toContain('Featured Speakers')
  })
})

describe('HomepageSectionRenderer — visibility & forward compat', () => {
  it('skips hidden sections and unknown types (never crashes)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const conference = makeConference()
    const sections = [
      { _key: '1', _type: 'homepageHero' },
      { _key: '2', _type: 'homepageMetrics', hidden: true },
      {
        _key: '3',
        _type: 'homepageCtaBanner',
        heading: 'Hi',
        buttonLabel: 'Go',
        buttonHref: '/x',
      },
      { _key: '4', _type: 'homepageFromTheFuture' },
      { _key: '5', _type: 'homepageRichText', content: [{ _type: 'block' }] },
    ] as unknown as HomepageSection[]

    const { container } = render(
      <HomepageSectionRenderer sections={sections} conference={conference} />,
    )
    const ids = testIdsInOrder(container)
    expect(ids).toEqual(['hero', 'cta-banner', 'rich-text'])
    expect(ids).not.toContain('metrics') // hidden
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('homepageFromTheFuture'),
    )
    warn.mockRestore()
  })
})

describe('HomepageSectionRenderer — F4 blocks', () => {
  it('renders FAQ, countdown (resolved target) and venue in order', () => {
    const conference = makeConference({ startDate: '2099-09-15' })
    const sections = [
      { _key: '1', _type: 'homepageFaq', source: 'ticketFaqs' },
      { _key: '2', _type: 'homepageCountdown' },
      { _key: '3', _type: 'homepageVenue' },
    ] as unknown as HomepageSection[]
    const { container } = render(
      <HomepageSectionRenderer sections={sections} conference={conference} />,
    )
    expect(testIdsInOrder(container)).toEqual(['faq', 'countdown', 'venue'])
    expect(
      container
        .querySelector('[data-testid="countdown"]')
        ?.getAttribute('data-target'),
    ).toBe(String(Date.UTC(2099, 8, 15, 12)))
  })

  it('renders nothing for a countdown with no resolvable target', () => {
    const conference = makeConference({ startDate: undefined })
    const sections = [
      { _key: '1', _type: 'homepageCountdown' },
    ] as unknown as HomepageSection[]
    const { container } = render(
      <HomepageSectionRenderer sections={sections} conference={conference} />,
    )
    expect(container.querySelector('[data-testid="countdown"]')).toBeNull()
  })
})
