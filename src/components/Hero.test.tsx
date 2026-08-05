/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
  }: {
    href: string
    children: React.ReactNode
  }) => <a href={href}>{children}</a>,
}))
vi.mock('@/components/BackgroundImage', () => ({
  BackgroundImage: () => <div data-testid="bg" />,
}))
vi.mock('@/components/TypewriterEffect', () => ({
  TypewriterEffect: () => <span data-testid="typewriter" />,
}))
vi.mock('@/components/CollapsibleDescription', () => ({
  CollapsibleDescription: ({ paragraphs }: { paragraphs: string[] }) => (
    <div data-testid="description">{paragraphs.join(' ')}</div>
  ),
}))

import { Hero } from './Hero'
import { buildOnboardingDocuments } from '@/lib/onboarding/create'
import type { Conference } from '@/lib/conference/types'

function makeConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'c1',
    title: 'Cloud Native Bergen',
    tagline: 'Real ',
    description: 'Default description',
    startDate: '2999-01-01',
    endDate: '2999-01-02',
    registrationEnabled: true,
    registrationLink: 'https://example.com/tickets',
    programDate: '2999-01-01',
    ...overrides,
  } as unknown as Conference
}

afterEach(cleanup)

describe('Hero — F1 override precedence', () => {
  it('renders the smart phase-aware default when no overrides are given', () => {
    render(<Hero conference={makeConference()} />)
    // "Real " tagline drives the animated typewriter default.
    expect(screen.getByTestId('typewriter')).toBeTruthy()
    // Phase default surfaces the Tickets CTA (registration available).
    expect(screen.getByText(/Tickets/i)).toBeTruthy()
    expect(screen.getByText('Default description')).toBeTruthy()
  })

  it('lets a headline override win over the tagline (plain text, no typewriter)', () => {
    render(
      <Hero
        conference={makeConference()}
        headlineOverride="A Bold New Headline"
      />,
    )
    expect(screen.getByText('A Bold New Headline')).toBeTruthy()
    expect(screen.queryByTestId('typewriter')).toBeNull()
  })

  it('lets a subheadline override replace the description', () => {
    render(
      <Hero
        conference={makeConference()}
        subheadlineOverride="Overridden copy"
      />,
    )
    expect(screen.getByText('Overridden copy')).toBeTruthy()
    expect(screen.queryByText('Default description')).toBeNull()
  })

  it('replaces the phase CTA row when CTA overrides are provided', () => {
    render(
      <Hero
        conference={makeConference()}
        ctaOverrides={[{ label: 'Reserve a seat', href: '/reserve' }]}
      />,
    )
    expect(screen.getByText('Reserve a seat')).toBeTruthy()
    // The smart phase buttons are gone.
    expect(screen.queryByText(/Tickets/i)).toBeNull()
    expect(screen.queryByText(/Practical Info/i)).toBeNull()
  })
})

/**
 * BACK-COMPAT TRIPWIRE for the hero variant work.
 *
 * These snapshots were generated from the PRE-VARIANT `Hero` — before the
 * `variant` prop existed at all. They are the proof that adding variants left
 * the default rendering byte-identical, which three live conference sites
 * depend on (they store no `variant`, so they resolve to `classic`).
 *
 * A failure here for the DEFAULT hero is a back-compat break: fix the code,
 * never `vitest -u`. New snapshots for `minimal`/`emblem` are expected.
 */
describe('Hero — default (classic) DOM equality', () => {
  const fullConference = makeConference({
    tagline: 'Where cloud native meets the fjords',
    description: 'A day of deep technical talks.\nOne track, no fluff.',
    venueName: 'Grieghallen',
    venueAddress: 'Edvard Griegs plass 1, Bergen',
    vanityMetrics: [
      { label: 'Attendees', value: '450+' },
      { label: 'Speakers', value: '40' },
    ],
    socialLinks: ['https://bsky.app/profile/example', 'https://example.com'],
  } as unknown as Partial<Conference>)

  it('renders the fully-populated hero identically', () => {
    const { container } = render(<Hero conference={fullConference} />)
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders the override path identically', () => {
    const { container } = render(
      <Hero
        conference={fullConference}
        headlineOverride="Tickets are live"
        subheadlineOverride="Early-bird pricing until 1 June."
        ctaOverrides={[
          { _key: 'a', label: 'Get your ticket', href: '/tickets' },
          { _key: 'b', label: 'Read the programme', href: '/program' },
        ]}
      />,
    )
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders the sparse hero identically', () => {
    const { container } = render(
      <Hero
        conference={makeConference({
          venueName: undefined,
          vanityMetrics: undefined,
          socialLinks: undefined,
          registrationEnabled: false,
        } as unknown as Partial<Conference>)}
      />,
    )
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders an ABSENT variant and an explicit "classic" identically', () => {
    const { container: absent } = render(<Hero conference={fullConference} />)
    const withoutVariant = absent.innerHTML
    cleanup()
    const { container: explicit } = render(
      <Hero conference={fullConference} variant="classic" />,
    )
    expect(explicit.innerHTML).toBe(withoutVariant)
  })

  it('falls back to classic for a variant from the future', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container: classic } = render(<Hero conference={fullConference} />)
    const expected = classic.innerHTML
    cleanup()
    const { container: future } = render(
      <Hero
        conference={fullConference}
        variant={'billboard' as unknown as 'classic'}
      />,
    )
    expect(future.innerHTML).toBe(expected)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('Hero — minimal variant', () => {
  const conference = makeConference({
    tagline: 'Where cloud native meets the fjords',
    city: 'Bergen',
    venueName: 'Grieghallen',
    venueAddress: 'Edvard Griegs plass 1, Bergen',
    startDate: '2999-10-27',
    endDate: '2999-10-28',
    vanityMetrics: [{ label: 'Attendees', value: '450+' }],
    socialLinks: ['https://example.com'],
  } as unknown as Partial<Conference>)

  it('drops the background wash, venue line, metrics and social row', () => {
    const { container } = render(
      <Hero conference={conference} variant="minimal" />,
    )
    expect(container.querySelector('[data-testid="bg"]')).toBeNull()
    expect(container.querySelector('dl')).toBeNull()
    expect(container.textContent).not.toContain('Edvard Griegs plass')
    expect(
      container.querySelectorAll('a[rel="noopener noreferrer"]'),
    ).toHaveLength(0)
  })

  it('sets the when/where as a typographic eyebrow instead', () => {
    const { container } = render(
      <Hero conference={conference} variant="minimal" />,
    )
    // Dates come from the house formatter; the city stands in for the venue.
    expect(container.textContent).toContain('oktober')
    expect(container.textContent).toContain('Bergen')
  })

  it('keeps the headline, description and the phase CTA row', () => {
    render(<Hero conference={conference} variant="minimal" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Where cloud native meets the fjords',
    )
    expect(screen.getByTestId('description')).toBeTruthy()
    expect(screen.getByText(/Tickets/i)).toBeTruthy()
  })

  it('still surfaces the organizer announcement', () => {
    render(
      <Hero
        conference={makeConference({
          announcement: [
            {
              _type: 'block',
              _key: 'a',
              children: [{ _type: 'span', text: 'The venue has moved.' }],
            },
          ],
        } as unknown as Partial<Conference>)}
        variant="minimal"
      />,
    )
    expect(screen.getByText('The venue has moved.')).toBeTruthy()
  })
})

describe('Hero — emblem variant', () => {
  const conference = makeConference({
    title: 'Cloud Native Days Bergen',
    tagline: 'Where cloud native meets the fjords',
    city: 'Bergen',
    startDate: '2999-10-27',
    endDate: '2999-10-28',
    vanityMetrics: [
      { label: 'Attendees', value: '450+' },
      { label: 'Speakers', value: '40' },
    ],
  } as unknown as Partial<Conference>)

  it('leads with the conference mark', () => {
    const { container } = render(
      <Hero conference={conference} variant="emblem" />,
    )
    // No logomark uploaded → the generated initials monogram, painted from the
    // tenant's own --brand-* properties.
    const mark = container.querySelector('svg[role="img"]')
    expect(mark).toBeTruthy()
    expect(mark?.getAttribute('aria-label')).toBe('Cloud Native Days Bergen')
  })

  it('arranges the name and dates around the mark', () => {
    const { container } = render(
      <Hero conference={conference} variant="emblem" />,
    )
    expect(container.textContent).toContain('Cloud Native Days Bergen')
    expect(container.textContent).toContain('Bergen')
    expect(container.textContent).toContain('oktober')
  })

  it('keeps the metrics, as a strip below the composition', () => {
    const { container } = render(
      <Hero conference={conference} variant="emblem" />,
    )
    const metrics = container.querySelector('dl')
    expect(metrics).toBeTruthy()
    expect(metrics?.textContent).toContain('450+')
  })

  it('keeps the phase CTA row', () => {
    render(<Hero conference={conference} variant="emblem" />)
    expect(screen.getByText(/Tickets/i)).toBeTruthy()
  })
})

/**
 * DAY ONE. `tagline` is optional on a real conference document and
 * `@/lib/onboarding/create.ts` provisions a tenant WITHOUT one, so the hero's
 * `<h1>` — the largest thing on the homepage — used to render empty, with the
 * conference name available only to screen readers.
 *
 * The fixture is built by the REAL provisioning builder so it cannot drift away
 * from what a new tenant actually gets.
 */
describe('Hero — a conference with no tagline', () => {
  function provisionedConference(): Conference {
    let key = 0
    const { conference } = buildOnboardingDocuments(
      {
        organization: {
          name: 'Brand New Events',
          slug: 'brand-new-events',
          contactEmail: 'hello@brand-new.example',
        },
        conference: {
          title: 'Brand New Conf',
          city: 'Bergen',
          country: 'Norway',
        },
        organizer: { name: 'Ada Organizer', email: 'ada@brand-new.example' },
        domains: ['brand-new.konf.run'],
      },
      {
        organizationId: 'org-fresh',
        conferenceId: 'conf-fresh',
        speakerId: 'speaker-fresh',
        mintKey: () => `key-${++key}`,
      },
      null,
    )
    return conference as unknown as Conference
  }

  it('provisioning really does omit the tagline', () => {
    // Premise guard: if provisioning starts seeding a tagline, these tests are
    // about a state that no longer exists.
    expect(provisionedConference().tagline).toBeUndefined()
  })

  it.each(['classic', 'minimal', 'emblem'] as const)(
    'names the conference in the visible heading (%s)',
    (variant) => {
      const { container } = render(
        <Hero conference={provisionedConference()} variant={variant} />,
      )
      const h1 = container.querySelector('h1')
      expect(h1?.textContent).toBe('Brand New Conf')
      // Not merely non-empty: the heading must not be a blank block with the
      // name hidden in an `sr-only` span beside it.
      expect(h1?.querySelector('.sr-only')).toBeNull()
    },
  )

  it.each(['classic', 'minimal', 'emblem'] as const)(
    'says the name once, not twice (%s)',
    (variant) => {
      const { container } = render(
        <Hero conference={provisionedConference()} variant={variant} />,
      )
      const occurrences = (container.textContent ?? '').split(
        'Brand New Conf',
      ).length
      expect(occurrences - 1).toBe(1)
    },
  )

  it('lets the title-as-headline size itself instead of clipping', () => {
    const { container } = render(<Hero conference={provisionedConference()} />)
    // The classic hero clamps its heading height to stop the typewriter from
    // jolting the page. A static title has no animation to reserve room for,
    // and a long conference name is exactly what the clamp would cut in half.
    expect(container.querySelector('h1')?.className).not.toContain('h-[5.5rem]')
  })

  it('keeps the sr-only name beside a REAL tagline', () => {
    const conference = provisionedConference()
    conference.tagline = 'Systems that hold at scale'
    const { container } = render(<Hero conference={conference} />)
    const h1 = container.querySelector('h1')
    expect(h1?.querySelector('.sr-only')?.textContent).toBe('Brand New Conf - ')
    expect(h1?.textContent).toContain('Systems that hold at scale')
    expect(h1?.className).toContain('h-[5.5rem]')
  })

  it('treats a whitespace-only tagline as no tagline', () => {
    const conference = provisionedConference()
    conference.tagline = '   '
    const { container } = render(<Hero conference={conference} />)
    expect(container.querySelector('h1')?.textContent).toBe('Brand New Conf')
  })

  it('still lets a stored headline override win', () => {
    const { container } = render(
      <Hero
        conference={provisionedConference()}
        headlineOverride="Tickets are live"
      />,
    )
    const h1 = container.querySelector('h1')
    expect(h1?.textContent).toContain('Tickets are live')
    // The override is not the title, so the name still needs its own mention.
    expect(h1?.querySelector('.sr-only')?.textContent).toBe('Brand New Conf - ')
  })
})
