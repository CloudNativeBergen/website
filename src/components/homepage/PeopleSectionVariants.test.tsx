/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// next/link → a plain anchor so the endcap and any CTA render in jsdom.
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
// The image CDN is a network boundary, not behaviour under test.
vi.mock('@/lib/sanity/client', () => ({
  speakerImageUrl: (image: unknown) => `https://cdn.example/${String(image)}`,
}))
// The DEFAULT leaves are stubbed: this file is about which leaf each variant
// picks and about the NEW markup, not about re-testing the shelf and the
// promotion card (both covered elsewhere). The new leaves render for real.
vi.mock('@/components/FeaturedSpeakersShelf', () => ({
  FeaturedSpeakersShelf: ({ speakers }: { speakers?: { _id: string }[] }) => (
    <div
      data-testid="featured-shelf"
      data-speakers={(speakers ?? []).map((s) => s._id).join(',')}
    />
  ),
}))
vi.mock('@/components/SpeakerPromotionCard', () => ({
  SpeakerPromotionCard: ({ speaker }: { speaker?: { name?: string } }) => (
    <div data-testid="organizer-card" data-name={speaker?.name ?? ''} />
  ),
}))

import { FeaturedSpeakersSectionView } from './FeaturedSpeakersSection'
import { OrganizersSectionView } from './OrganizersSection'
import { resolveHomepageLifecycle } from '@/lib/homepage/lifecycle'
import type { FeaturedSpeakersSection, OrganizersSection } from '@/lib/homepage'
import type { Conference } from '@/lib/conference/types'

const speakers = [
  {
    _id: 'sp1',
    name: 'Ingrid Halvorsen',
    slug: 'ingrid',
    title: 'SRE at Vipps',
    image: 'img1',
  },
  {
    _id: 'sp2',
    name: 'Mateusz Nowak',
    slug: 'mateusz',
    title: 'Platform Engineer',
  },
  {
    _id: 'sp3',
    name: 'Sara Lindqvist',
    slug: 'sara',
    title: 'Staff Engineer at Spotify',
    image: 'img3',
  },
]

const organizers = [
  { _id: 'o1', name: 'Ada Lovelace', title: 'Programme chair', image: 'img-a' },
  { _id: 'o2', name: 'Bjørn Olsen', title: 'Community lead at Bekk' },
  { _id: 'o3', name: 'Åsa Nordmann', title: 'Sponsorship', image: 'img-c' },
]

function makeConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conf-1',
    title: 'Test Conf',
    programDate: '2999-01-01',
    startDate: '2999-01-01',
    endDate: '2999-01-02',
    registrationEnabled: false,
    schedules: [],
    featuredSpeakers: speakers,
    organizers,
    sponsors: [],
    ...overrides,
  } as unknown as Conference
}

afterEach(cleanup)

function speakersMarkup(
  section: Partial<FeaturedSpeakersSection> = {},
  conference: Conference = makeConference(),
) {
  const { container } = render(
    <FeaturedSpeakersSectionView
      conference={conference}
      section={{ _key: 'f', _type: 'homepageFeaturedSpeakers', ...section }}
      lifecycle={resolveHomepageLifecycle(conference)}
    />,
  )
  return container.innerHTML
}

function organizersMarkup(
  section: Partial<OrganizersSection> = {},
  conference: Conference = makeConference(),
) {
  const { container } = render(
    <OrganizersSectionView
      conference={conference}
      section={{ _key: 'o', _type: 'homepageOrganizers', ...section }}
      lifecycle={resolveHomepageLifecycle(conference)}
    />,
  )
  return container.innerHTML
}

/**
 * THE BACK-COMPAT GUARANTEE, per component.
 *
 * "Absent variant renders byte-identically to today" is enforced in two places:
 * the pre-variant snapshots in `SectionRenderer.test.tsx` (which this batch does
 * not touch), and these — an absent variant must render the SAME DOM as the
 * explicit default, so a stored default and a stored nothing can never diverge.
 */
describe('people sections — default variants are inert', () => {
  it('featured speakers: absent variant === explicit "shelf"', () => {
    expect(speakersMarkup()).toBe(speakersMarkup({ variant: 'shelf' }))
  })

  it('organizers: absent variant === explicit "cards"', () => {
    expect(organizersMarkup()).toBe(organizersMarkup({ variant: 'cards' }))
  })

  it('an UNKNOWN variant falls back to the default rendering, never to nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fromTheFuture = {
      variant: 'hologram',
    } as unknown as FeaturedSpeakersSection
    expect(speakersMarkup(fromTheFuture)).toBe(speakersMarkup())
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('hologram'))
    warn.mockRestore()
  })
})

describe('featured speakers — grid variant', () => {
  it('renders a static grid instead of the scrolling shelf', () => {
    const grid = speakersMarkup({ variant: 'grid' })
    expect(grid).not.toBe(speakersMarkup())
    // The shelf leaf is not mounted at all…
    expect(grid).not.toContain('data-testid="featured-shelf"')
    // …and every speaker is present without any scrolling affordance.
    for (const s of speakers) expect(grid).toContain(s.name)
    expect(grid).not.toContain('overflow-x-auto')
    expect(grid).not.toContain('snap-x')
  })

  it('keeps the shared band copy and the "view all" escape hatch', () => {
    const { container } = render(
      <FeaturedSpeakersSectionView
        conference={makeConference()}
        section={{
          _key: 'f',
          _type: 'homepageFeaturedSpeakers',
          variant: 'grid',
          heading: 'Who you will hear',
        }}
        lifecycle={resolveHomepageLifecycle(makeConference())}
      />,
    )
    expect(container.textContent).toContain('Who you will hear')
    expect(
      container.querySelector('a[href="/speaker"]')?.textContent,
    ).toContain('View all speakers')
  })

  it('renders nothing without speakers, exactly like the default', () => {
    const empty = makeConference({ featuredSpeakers: [] })
    expect(speakersMarkup({ variant: 'grid' }, empty)).toBe('')
    expect(speakersMarkup({}, empty)).toBe('')
  })

  it('matches its snapshot', () => {
    expect(speakersMarkup({ variant: 'grid' })).toMatchSnapshot()
  })
})

describe('organizers — compact variant', () => {
  it('renders a dense roster instead of promotion cards', () => {
    const compact = organizersMarkup({ variant: 'compact' })
    expect(compact).not.toBe(organizersMarkup())
    expect(compact).not.toContain('data-testid="organizer-card"')
    for (const o of organizers) expect(compact).toContain(o.name)
  })

  it('keeps the band sorted by name, like the cards variant', () => {
    const { container } = render(
      <OrganizersSectionView
        conference={makeConference()}
        section={{ _key: 'o', _type: 'homepageOrganizers', variant: 'compact' }}
        lifecycle={resolveHomepageLifecycle(makeConference())}
      />,
    )
    const names = Array.from(
      container.querySelectorAll('li p:first-child'),
    ).map((el) => el.textContent)
    expect(names).toEqual(['Ada Lovelace', 'Åsa Nordmann', 'Bjørn Olsen'])
  })

  it('shows the role with the company fragment stripped', () => {
    const { container } = render(
      <OrganizersSectionView
        conference={makeConference()}
        section={{ _key: 'o', _type: 'homepageOrganizers', variant: 'compact' }}
        lifecycle={resolveHomepageLifecycle(makeConference())}
      />,
    )
    // "Community lead at Bekk" → the role, not the duplicated company.
    expect(container.textContent).toContain('Community lead')
    expect(container.textContent).not.toContain('Community lead at Bekk')
  })

  it('renders nothing without organizers, exactly like the default', () => {
    const empty = makeConference({ organizers: [] })
    expect(organizersMarkup({ variant: 'compact' }, empty)).toBe('')
    expect(organizersMarkup({}, empty)).toBe('')
  })

  it('matches its snapshot', () => {
    expect(organizersMarkup({ variant: 'compact' })).toMatchSnapshot()
  })
})
