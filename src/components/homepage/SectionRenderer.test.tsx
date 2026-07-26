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
  Sponsors: () => <div data-testid="sponsors" />,
}))
vi.mock('@/components/ImageGallery', () => ({
  ImageGallery: () => <div data-testid="gallery" />,
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
