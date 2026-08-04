/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// Stub the leaf components the renderer maps to, so the test verifies the
// mapping/order/skip logic — not the (separately tested) leaf components.
// `SaveTheDate` and `LifecycleNotice` are deliberately NOT stubbed: this file is
// the only test that covers them, so a stand-in would assert nothing.
//
// next/link → a plain anchor so `Button href=…` renders in jsdom. `...rest` is
// forwarded because the analytics contract lives in `data-pirsch-event`
// attributes on those anchors.
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string
    children: React.ReactNode
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/Hero', () => ({
  Hero: () => <div data-testid="hero" />,
}))
// The props are surfaced as data attributes so the DOM-equality snapshots below
// prove the band still hands the SAME inputs to the leaf after extraction.
vi.mock('@/components/ProgramHighlights', () => ({
  ProgramHighlights: ({
    schedules,
    featuredSpeakers,
    featuredTalks,
    conference,
  }: {
    schedules?: unknown[]
    featuredSpeakers?: unknown[]
    featuredTalks?: unknown[]
    conference?: { _id?: string }
  }) => (
    <div
      data-testid="program"
      data-schedules={schedules?.length ?? -1}
      data-speakers={featuredSpeakers?.length ?? -1}
      data-talks={featuredTalks?.length ?? -1}
      data-conference={conference?._id ?? ''}
    />
  ),
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
  FeaturedSpeakersShelf: ({ speakers }: { speakers?: { _id: string }[] }) => (
    <div
      data-testid="featured-shelf"
      data-speakers={(speakers ?? []).map((s) => s._id).join(',')}
    />
  ),
}))
vi.mock('@/components/SpeakerPromotionCard', () => ({
  SpeakerPromotionCard: ({
    speaker,
    variant,
  }: {
    speaker?: { name?: string; talks?: unknown[] }
    variant?: string
  }) => (
    <div
      data-testid="organizer-card"
      data-name={speaker?.name ?? ''}
      data-variant={variant ?? ''}
      data-talks={speaker?.talks?.length ?? -1}
    />
  ),
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
// The clock-driven halves of the countdown are stubbed (they tick on a timer);
// `CountdownStrip` is what the REAL SaveTheDate embeds, so the stub keeps that
// band renderable. Neither stub carries a `data-testid`-free marker by accident:
// `countdown` is asserted on directly, the strip deliberately is not.
vi.mock('@/components/homepage/Countdown', () => ({
  Countdown: ({ targetMs }: { targetMs: number }) => (
    <div data-testid="countdown" data-target={targetMs} />
  ),
  CountdownStrip: ({ targetMs }: { targetMs: number }) => (
    <div data-countdown-strip={targetMs} />
  ),
}))
vi.mock('@/components/homepage/VenueBlock', () => ({
  VenueBlock: () => <div data-testid="venue" />,
}))

import { HomepageSectionRenderer } from './SectionRenderer'
import { getDefaultSections, type HomepageSection } from '@/lib/homepage'
import type { Conference } from '@/lib/conference/types'
import type { TicketAvailability } from '@/lib/tickets/public'

function makeConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conf-1',
    title: 'Test Conf',
    programDate: '2000-01-01',
    endDate: '2999-01-01',
    registrationEnabled: false,
    schedules: [
      {
        _id: 's1',
        date: '2999-01-01',
        tracks: [
          {
            trackTitle: 'Track 1',
            trackDescription: '',
            talks: [
              {
                startTime: '09:00',
                endTime: '09:45',
                talk: { _id: 't1', status: 'confirmed' },
              },
            ],
          },
        ],
      },
    ],
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

/**
 * Section markers in document order. Stubbed leaves expose a `data-testid`; the
 * REAL save-the-date band is identified by the heading id its own component
 * owns, so it joins the ordering assertions without the production component
 * having to carry a test-only attribute.
 */
function sectionsInOrder(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll(
      '[data-testid], [aria-labelledby="save-the-date-title"]',
    ),
  ).map((el) => el.getAttribute('data-testid') ?? 'save-the-date')
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

describe('HomepageSectionRenderer — lifecycle states', () => {
  it('inserts the save-the-date band on a day-one conference', () => {
    const conference = makeConference({
      startDate: '2999-01-01',
      programDate: '2999-01-01',
      schedules: [],
      featuredSpeakers: [],
      featuredGalleryImages: [],
      venueName: 'Grieghallen',
      city: 'Bergen',
    })
    const { container } = render(
      <HomepageSectionRenderer
        sections={getDefaultSections(conference)}
        conference={conference}
      />,
    )
    const ids = sectionsInOrder(container)
    expect(ids[0]).toBe('hero')
    expect(ids[1]).toBe('save-the-date')
    // The REAL band, not a stand-in: its house heading plus the dates and place
    // it derives from the conference document.
    expect(container.textContent).toContain('Save the date')
    expect(container.textContent).toContain('Grieghallen, Bergen')
  })

  for (const status of ['cancelled', 'archived'] as const) {
    it(`REPLACES the whole page for a ${status} conference`, () => {
      const conference = makeConference({ lifecycleStatus: status })
      const { container } = render(
        <HomepageSectionRenderer
          sections={getDefaultSections(conference)}
          conference={conference}
        />,
      )
      // NOTHING from the section list survives — that is the whole point of the
      // short-circuit; the notice below is all there is.
      expect(sectionsInOrder(container)).toEqual([])
      expect(container.textContent).toContain(
        status === 'cancelled'
          ? 'Test Conf has been cancelled'
          : 'Test Conf has ended',
      )
    })

    it(`ignores a STORED composition for a ${status} conference`, () => {
      const conference = makeConference({ lifecycleStatus: status })
      const sections = [
        { _key: '1', _type: 'homepageHero' },
        { _key: '2', _type: 'homepageSponsors' },
      ] as unknown as HomepageSection[]
      const { container } = render(
        <HomepageSectionRenderer sections={sections} conference={conference} />,
      )
      expect(sectionsInOrder(container)).toEqual([])
      expect(container.textContent).toContain('Test Conf has')
    })
  }

  it('drops the program band when the published schedule holds no talks', () => {
    const conference = makeConference({
      schedules: [{ _id: 's1', date: '2999-01-01', tracks: [] }] as never,
    })
    const sections = [
      { _key: '1', _type: 'homepageProgramHighlights' },
    ] as unknown as HomepageSection[]
    const { container } = render(
      <HomepageSectionRenderer sections={sections} conference={conference} />,
    )
    expect(container.querySelector('[data-testid="program"]')).toBeNull()
  })
})

describe('HomepageSectionRenderer — phase CTA row', () => {
  /** A published schedule whose one confirmed talk carries a recording URL. */
  function schedulesWithRecording() {
    return [
      {
        _id: 's1',
        date: '2000-01-01',
        tracks: [
          {
            trackTitle: 'Track 1',
            trackDescription: '',
            talks: [
              {
                startTime: '09:00',
                endTime: '09:45',
                talk: {
                  _id: 't1',
                  status: 'confirmed',
                  attachments: [
                    {
                      _key: 'a1',
                      _type: 'urlAttachment',
                      attachmentType: 'recording',
                      url: 'https://example.com/watch',
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ] as never
  }

  const featuredSpeakersOnly = [
    { _key: 'f', _type: 'homepageFeaturedSpeakers' },
  ] as unknown as HomepageSection[]
  const organizersOnly = [
    { _key: 'o', _type: 'homepageOrganizers' },
  ] as unknown as HomepageSection[]

  function programmeLink(container: HTMLElement) {
    return container.querySelector('a[href="/program"]')
  }

  it('tracks the programme CTA as its OWN event, not as the info CTA', () => {
    const conference = makeConference({
      startDate: '2000-01-01',
      endDate: '2000-01-02',
      schedules: schedulesWithRecording(),
    })
    const { container } = render(
      <HomepageSectionRenderer
        sections={featuredSpeakersOnly}
        conference={conference}
      />,
    )
    const link = programmeLink(container)
    expect(link?.getAttribute('data-pirsch-event')).toBe(
      'cta-program-featured-speakers',
    )
    // …and it is NOT conflated with the /info CTA, which is the bug.
    expect(link?.getAttribute('data-pirsch-event')).not.toBe(
      'cta-info-featured-speakers',
    )
  })

  it('uses the organizers-scoped programme event in the organizers band', () => {
    const conference = makeConference({
      startDate: '2000-01-01',
      endDate: '2000-01-02',
      schedules: schedulesWithRecording(),
    })
    const { container } = render(
      <HomepageSectionRenderer
        sections={organizersOnly}
        conference={conference}
      />,
    )
    expect(programmeLink(container)?.getAttribute('data-pirsch-event')).toBe(
      'cta-program-featured-organizers',
    )
  })

  it('offers "Watch the talks" only AFTER the event', () => {
    const conference = makeConference({
      startDate: '2000-01-01',
      endDate: '2000-01-02',
      schedules: schedulesWithRecording(),
    })
    const { container } = render(
      <HomepageSectionRenderer
        sections={featuredSpeakersOnly}
        conference={conference}
      />,
    )
    expect(programmeLink(container)?.textContent).toContain('Watch the talks')
  })

  it('never advertises recordings on a PRE-EVENT page', () => {
    // Programme published, event still ahead, and a talk already carries a
    // recording link (a re-run, a teaser). The label must stay forward-looking.
    const conference = makeConference({
      startDate: '2999-01-01',
      endDate: '2999-01-02',
      programDate: '2000-01-01',
      schedules: schedulesWithRecording(),
    })
    const { container } = render(
      <HomepageSectionRenderer
        sections={featuredSpeakersOnly}
        conference={conference}
      />,
    )
    const link = programmeLink(container)
    expect(link?.textContent).toContain('See the programme')
    expect(container.textContent).not.toContain('Watch the talks')
    // The event name does not depend on the label.
    expect(link?.getAttribute('data-pirsch-event')).toBe(
      'cta-program-featured-speakers',
    )
  })
})

/**
 * DOM-EQUALITY GUARD (renderer decomposition).
 *
 * These snapshots were generated from the pre-decomposition renderer — the
 * version that defined `PhaseCtaRow` and the three section views INSIDE
 * `SectionRenderer.tsx`. They are the proof that moving those views into their
 * own modules changed no markup at all: the extraction commit does not touch
 * these expectations, and the snapshots still match.
 *
 * They stay useful afterwards: a batch that changes a band's DEFAULT markup has
 * to update a snapshot here on purpose, which is exactly the review moment the
 * "default variant renders byte-identically" invariant needs.
 */
describe('HomepageSectionRenderer — extracted-view DOM equality', () => {
  const featuredSpeakersOnly = [
    { _key: 'f', _type: 'homepageFeaturedSpeakers' },
  ] as unknown as HomepageSection[]
  const organizersOnly = [
    { _key: 'o', _type: 'homepageOrganizers' },
  ] as unknown as HomepageSection[]
  const programOnly = [
    { _key: 'p', _type: 'homepageProgramHighlights' },
  ] as unknown as HomepageSection[]

  function markup(
    sections: HomepageSection[],
    conference: Conference,
    props: {
      ticketsFromPrice?: string | null
      ticketAvailability?: TicketAvailability | null
    } = {},
  ) {
    const { container } = render(
      <HomepageSectionRenderer
        sections={sections}
        conference={conference}
        ticketsFromPrice={props.ticketsFromPrice}
        ticketAvailability={props.ticketAvailability}
      />,
    )
    return container.innerHTML
  }

  it('renders the whole default composition identically', () => {
    const conference = makeConference()
    expect(markup(getDefaultSections(conference), conference)).toMatchSnapshot()
  })

  it('renders the featured-speakers band with house copy identically', () => {
    const conference = makeConference({
      programDate: '2999-01-01',
      schedules: [],
    })
    expect(markup(featuredSpeakersOnly, conference)).toMatchSnapshot()
  })

  it('renders the featured-speakers band with configured copy identically', () => {
    const conference = makeConference({
      programDate: '2999-01-01',
      schedules: [],
    })
    const sections = [
      {
        _key: 'f',
        _type: 'homepageFeaturedSpeakers',
        heading: 'Who you will hear',
        description: 'A hand-picked line-up',
      },
    ] as unknown as HomepageSection[]
    expect(markup(sections, conference)).toMatchSnapshot()
  })

  it('renders nothing for the featured-speakers band without speakers', () => {
    const conference = makeConference({ featuredSpeakers: [] })
    expect(markup(featuredSpeakersOnly, conference)).toBe('')
  })

  it('renders the organizers band (sorted, house copy) identically', () => {
    const conference = makeConference({
      organizers: [
        { _id: 'o2', name: 'åsa Nordmann' },
        { _id: 'o1', name: 'Bjørn Olsen' },
        { _id: 'o3', name: 'ada Lovelace' },
      ] as never,
      programDate: '2999-01-01',
      schedules: [],
    })
    expect(markup(organizersOnly, conference)).toMatchSnapshot()
  })

  it('renders nothing for the organizers band without organizers', () => {
    const conference = makeConference({ organizers: [] })
    expect(markup(organizersOnly, conference)).toBe('')
  })

  it('renders the program-highlights band identically', () => {
    const conference = makeConference({
      featuredTalks: [{ _id: 't1' }] as never,
    })
    expect(markup(programOnly, conference)).toMatchSnapshot()
  })

  it('renders nothing for the program-highlights band without a programme', () => {
    const conference = makeConference({ schedules: [] })
    expect(markup(programOnly, conference)).toBe('')
  })

  describe('phase CTA row', () => {
    it('renders the CFP branch with an outline ticket button and price caption', () => {
      const conference = makeConference({
        cfpStartDate: '2000-01-01',
        cfpEndDate: '2999-01-01',
        programDate: '2999-01-01',
        schedules: [],
        registrationEnabled: true,
        registrationLink: 'https://tickets.example.com',
      })
      expect(
        markup(featuredSpeakersOnly, conference, { ticketsFromPrice: '1 500' }),
      ).toMatchSnapshot()
    })

    it('renders the tickets branch as the primary CTA', () => {
      const conference = makeConference({
        programDate: '2999-01-01',
        schedules: [],
        registrationEnabled: true,
        registrationLink: 'https://tickets.example.com',
      })
      expect(
        markup(featuredSpeakersOnly, conference, { ticketsFromPrice: '1 500' }),
      ).toMatchSnapshot()
    })

    it('renders the info branch plus the sold-out notice', () => {
      const conference = makeConference({
        programDate: '2999-01-01',
        schedules: [],
        registrationEnabled: true,
        registrationLink: 'https://tickets.example.com',
      })
      expect(
        markup(organizersOnly, conference, {
          ticketsFromPrice: '1 500',
          ticketAvailability: 'sold-out',
        }),
      ).toMatchSnapshot()
    })

    it('renders the programme branch on a pre-event page', () => {
      const conference = makeConference()
      expect(markup(featuredSpeakersOnly, conference)).toMatchSnapshot()
    })

    it('renders the post-event programme branch with recordings', () => {
      const conference = makeConference({
        startDate: '2000-01-01',
        endDate: '2000-01-02',
        schedules: [
          {
            _id: 's1',
            date: '2000-01-01',
            tracks: [
              {
                trackTitle: 'Track 1',
                trackDescription: '',
                talks: [
                  {
                    startTime: '09:00',
                    endTime: '09:45',
                    talk: {
                      _id: 't1',
                      status: 'confirmed',
                      attachments: [
                        {
                          _key: 'a1',
                          _type: 'urlAttachment',
                          attachmentType: 'recording',
                          url: 'https://example.com/watch',
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        ] as never,
      })
      expect(markup(organizersOnly, conference)).toMatchSnapshot()
    })
  })
})
