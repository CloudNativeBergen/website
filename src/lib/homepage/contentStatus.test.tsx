/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { findRuntimeModuleImports } from '../../../__tests__/helpers/moduleImports'

// The ONLY stub in this file, and it is not a section component: `next/link`
// needs a router in jsdom. Everything the renderer maps to is the REAL
// component — stubbing one would make the parity assertion below meaningless,
// because a stub cannot self-hide the way the thing it stands in for does.
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

import { HomepageSectionRenderer } from '@/components/homepage/SectionRenderer'
import {
  CONTENT_SOURCES,
  sectionContentStatus,
  type SectionContentSourceId,
} from './contentStatus'
import {
  HOMEPAGE_SECTION_TYPES,
  type HomepageSection,
  type HomepageSectionType,
} from './sections'
import type { Conference } from '@/lib/conference/types'

afterEach(cleanup)

/**
 * A conference with NOTHING on it — the day-one state, which is the state that
 * makes every guard in `contentStatus.ts` fire. Cases below add exactly the one
 * field they are about, so a passing render can never be explained by a
 * neighbouring field left set in the fixture.
 */
function bareConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conf-1',
    title: 'Test Conf',
    city: '',
    registrationEnabled: false,
    organizers: [],
    ...overrides,
  } as unknown as Conference
}

/** Dates chosen so the REAL clock puts them unambiguously in the past/future. */
const PAST = '2000-01-01'
const FUTURE = '2099-01-01'

function scheduleWith(status: 'confirmed' | 'submitted') {
  return [
    {
      _id: 's1',
      date: PAST,
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
                status,
                title: 'A talk',
                format: 'presentation_25',
                speakers: [],
                topics: [],
              },
            },
          ],
        },
      ],
    },
  ] as never
}

interface Case {
  /** Names the case in the test output. */
  name: string
  section: HomepageSection
  conference: Conference
  /** The expectation this file is about. Verified against a REAL render. */
  willHide: boolean
}

/**
 * The case table, keyed by section type.
 *
 * TYPE-LEVEL COVERAGE: `Record<HomepageSectionType, …>` means a fourteenth
 * entry in `HOMEPAGE_SECTION_TYPES` fails to COMPILE here until it is given
 * cases — the repo has already shipped a bug where a new field was added
 * everywhere except one per-type mapping, and a table that silently skips a
 * type would let the preview lie about it. The runtime assertion below pins the
 * other direction (no stale keys, and at least one hiding case wherever the
 * section can hide at all).
 */
const CASES: Record<HomepageSectionType, Case[]> = {
  homepageHero: [
    {
      name: 'always renders — the page always has a top',
      section: { _key: 'h', _type: 'homepageHero' },
      conference: bareConference(),
      willHide: false,
    },
  ],

  homepageSaveTheDate: [
    {
      name: 'no dates and no place',
      section: { _key: 's', _type: 'homepageSaveTheDate' },
      conference: bareConference(),
      willHide: true,
    },
    {
      name: 'only a start date (the range needs both)',
      section: { _key: 's', _type: 'homepageSaveTheDate' },
      conference: bareConference({ startDate: FUTURE }),
      willHide: true,
    },
    {
      name: 'a city but no dates still announces something',
      section: { _key: 's', _type: 'homepageSaveTheDate' },
      conference: bareConference({ city: 'Bergen' }),
      willHide: false,
    },
    {
      name: 'both dates',
      section: { _key: 's', _type: 'homepageSaveTheDate' },
      conference: bareConference({ startDate: FUTURE, endDate: FUTURE }),
      willHide: false,
    },
  ],

  homepageFeaturedSpeakers: [
    {
      name: 'no featured speakers',
      section: { _key: 'f', _type: 'homepageFeaturedSpeakers' },
      conference: bareConference(),
      willHide: true,
    },
    {
      name: 'one featured speaker',
      section: { _key: 'f', _type: 'homepageFeaturedSpeakers' },
      conference: bareConference({
        featuredSpeakers: [{ _id: 'sp1', name: 'Speaker', talks: [] }] as never,
      }),
      willHide: false,
    },
  ],

  homepageProgramHighlights: [
    {
      name: 'no programme date',
      section: { _key: 'p', _type: 'homepageProgramHighlights' },
      conference: bareConference({ schedules: scheduleWith('confirmed') }),
      willHide: true,
    },
    {
      name: 'programme date still ahead',
      section: { _key: 'p', _type: 'homepageProgramHighlights' },
      conference: bareConference({
        programDate: FUTURE,
        schedules: scheduleWith('confirmed'),
      }),
      willHide: true,
    },
    {
      name: 'published but the schedule holds no CONFIRMED talk',
      section: { _key: 'p', _type: 'homepageProgramHighlights' },
      conference: bareConference({
        programDate: PAST,
        schedules: scheduleWith('submitted'),
      }),
      willHide: true,
    },
    {
      name: 'published with a confirmed talk',
      section: { _key: 'p', _type: 'homepageProgramHighlights' },
      conference: bareConference({
        programDate: PAST,
        startDate: FUTURE,
        endDate: FUTURE,
        schedules: scheduleWith('confirmed'),
      }),
      willHide: false,
    },
  ],

  homepageOrganizers: [
    {
      name: 'no organizers',
      section: { _key: 'o', _type: 'homepageOrganizers' },
      conference: bareConference(),
      willHide: true,
    },
    {
      name: 'one organizer',
      section: { _key: 'o', _type: 'homepageOrganizers' },
      conference: bareConference({
        organizers: [{ _id: 'o1', name: 'Organizer' }] as never,
      }),
      willHide: false,
    },
  ],

  homepageSponsors: [
    {
      name: 'no sponsors — degrades to the pitch, never hides',
      section: { _key: 'sp', _type: 'homepageSponsors' },
      conference: bareConference(),
      willHide: false,
    },
    {
      // The band still emits its `<section>` wrapper: vertical whitespace and
      // nothing else. Not a hide, and the status says so in words instead.
      name: 'no sponsors AND the pitch switched off — an empty band, not a hide',
      section: { _key: 'sp', _type: 'homepageSponsors', showCta: false },
      conference: bareConference(),
      willHide: false,
    },
    {
      name: 'sponsors in a tier',
      section: { _key: 'sp', _type: 'homepageSponsors' },
      conference: bareConference({
        sponsors: [
          {
            sponsor: { _id: 'x', name: 'Acme', website: 'https://acme.test' },
            tier: { title: 'Gold', tagline: '', tierType: 'standard' },
          },
        ] as never,
      }),
      willHide: false,
    },
  ],

  homepageGallery: [
    {
      name: 'no featured images',
      section: { _key: 'g', _type: 'homepageGallery' },
      conference: bareConference(),
      willHide: true,
    },
    {
      name: 'one featured image',
      section: { _key: 'g', _type: 'homepageGallery' },
      conference: bareConference({
        featuredGalleryImages: [
          {
            _id: 'g1',
            image: { asset: { _ref: 'image-abc-100x100-png' } },
            speakers: [],
          },
        ] as never,
      }),
      willHide: false,
    },
  ],

  homepageMetrics: [
    {
      name: 'no vanity metrics',
      section: { _key: 'm', _type: 'homepageMetrics' },
      conference: bareConference(),
      willHide: true,
    },
    {
      name: 'one vanity metric',
      section: { _key: 'm', _type: 'homepageMetrics' },
      conference: bareConference({
        vanityMetrics: [{ label: 'Attendees', value: '500+' }] as never,
      }),
      willHide: false,
    },
  ],

  homepageCtaBanner: [
    {
      name: 'complete banner',
      section: {
        _key: 'c',
        _type: 'homepageCtaBanner',
        heading: 'Join us',
        buttonLabel: 'Get tickets',
        buttonHref: '/tickets',
      },
      conference: bareConference(),
      willHide: false,
    },
    {
      name: 'no button — degraded, but the heading still renders',
      section: {
        _key: 'c',
        _type: 'homepageCtaBanner',
        heading: 'Join us',
        buttonLabel: '',
        buttonHref: '',
      },
      conference: bareConference(),
      willHide: false,
    },
  ],

  homepageRichText: [
    {
      name: 'no content at all',
      section: { _key: 'r', _type: 'homepageRichText', content: [] },
      conference: bareConference(),
      willHide: true,
    },
    {
      // The stored array is NON-empty; the sanitizer drops the block, which is
      // exactly the case a naive `content.length > 0` predicate would lie about.
      name: 'content the allowlist drops',
      section: {
        _key: 'r',
        _type: 'homepageRichText',
        content: [{ _type: 'notARichTextBlock', whatever: true }] as never,
      },
      conference: bareConference(),
      willHide: true,
    },
    {
      name: 'a paragraph of whitespace',
      section: {
        _key: 'r',
        _type: 'homepageRichText',
        content: [
          {
            _type: 'block',
            _key: 'b1',
            children: [{ _type: 'span', _key: 's1', text: '   ', marks: [] }],
          },
        ] as never,
      },
      conference: bareConference(),
      willHide: true,
    },
    {
      name: 'real prose',
      section: {
        _key: 'r',
        _type: 'homepageRichText',
        content: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'Hello', marks: [] }],
          },
        ] as never,
      },
      conference: bareConference(),
      willHide: false,
    },
  ],

  homepageFaq: [
    {
      name: 'own source with no items',
      section: { _key: 'q', _type: 'homepageFaq' },
      conference: bareConference(),
      willHide: true,
    },
    {
      name: 'ticket-FAQ source with no ticket FAQs',
      section: { _key: 'q', _type: 'homepageFaq', source: 'ticketFaqs' },
      conference: bareConference({
        ticketFaqs: [],
        // Own items are irrelevant once the source is switched — the band
        // renders the ticket FAQs, and there are none.
      }),
      willHide: true,
    },
    {
      name: 'own items',
      section: {
        _key: 'q',
        _type: 'homepageFaq',
        items: [{ question: 'Where?', answer: 'Here.' }],
      },
      conference: bareConference(),
      willHide: false,
    },
    {
      name: 'ticket FAQs',
      section: { _key: 'q', _type: 'homepageFaq', source: 'ticketFaqs' },
      conference: bareConference({
        ticketFaqs: [{ question: 'Refunds?', answer: 'Yes.' }] as never,
      }),
      willHide: false,
    },
  ],

  homepageCountdown: [
    {
      name: 'nothing to count down to',
      section: { _key: 'd', _type: 'homepageCountdown' },
      conference: bareConference(),
      willHide: true,
    },
    {
      // Two guards away: the target resolves, so the renderer mounts the block —
      // and the client component then hides itself because the date has passed.
      name: 'target already passed, no live message',
      section: { _key: 'd', _type: 'homepageCountdown' },
      conference: bareConference({ startDate: PAST }),
      willHide: true,
    },
    {
      name: 'target passed WITH a live message',
      section: {
        _key: 'd',
        _type: 'homepageCountdown',
        liveMessage: 'We are live!',
      },
      conference: bareConference({ startDate: PAST }),
      willHide: false,
    },
    {
      name: 'future target',
      section: { _key: 'd', _type: 'homepageCountdown' },
      conference: bareConference({ startDate: FUTURE }),
      willHide: false,
    },
    {
      name: 'a block-level override beats an absent start date',
      section: {
        _key: 'd',
        _type: 'homepageCountdown',
        targetOverride: FUTURE,
      },
      conference: bareConference(),
      willHide: false,
    },
  ],

  homepageVenue: [
    {
      name: 'no venue name or address',
      section: { _key: 'v', _type: 'homepageVenue' },
      conference: bareConference(),
      willHide: true,
    },
    {
      name: 'whitespace is not a venue',
      section: { _key: 'v', _type: 'homepageVenue' },
      conference: bareConference({ venueName: '  ', venueAddress: '\n' }),
      willHide: true,
    },
    {
      name: 'a venue name',
      section: { _key: 'v', _type: 'homepageVenue' },
      conference: bareConference({ venueName: 'Grieghallen' }),
      willHide: false,
    },
  ],
}

/**
 * THE test this module exists for.
 *
 * For every section type and every case: `willHide` is true EXACTLY when
 * rendering that section through the real `HomepageSectionRenderer` — with the
 * real section components — produces an empty container. A status that claims
 * a band renders when the live page drops it makes the composer's preview lie
 * to the organizer, which is worse than having no preview at all.
 */
describe('sectionContentStatus ⇔ the renderer', () => {
  for (const type of HOMEPAGE_SECTION_TYPES) {
    describe(type, () => {
      for (const testCase of CASES[type]) {
        it(`${testCase.willHide ? 'hides' : 'renders'}: ${testCase.name}`, () => {
          const status = sectionContentStatus(
            testCase.section,
            testCase.conference,
          )
          expect(status.type).toBe(type)
          expect(status.willHide).toBe(testCase.willHide)
          expect(status.kind === 'empty-hides').toBe(status.willHide)

          const { container } = render(
            <HomepageSectionRenderer
              sections={[testCase.section]}
              conference={testCase.conference}
            />,
          )
          expect(container.innerHTML === '').toBe(status.willHide)
        })
      }
    })
  }
})

describe('the case table itself', () => {
  it('covers every registered section type, and nothing else', () => {
    expect(Object.keys(CASES).sort()).toEqual(
      [...HOMEPAGE_SECTION_TYPES].sort(),
    )
  })

  /**
   * Three bands cannot hide — the hero has no data guard, and the sponsors and
   * CTA-banner components have no early return at all. Every OTHER type must
   * bring a hiding case, so this suite can never degrade into "13 happy paths".
   */
  it('exercises the hiding path for every type that has one', () => {
    const cannotHide: HomepageSectionType[] = [
      'homepageHero',
      'homepageSponsors',
      'homepageCtaBanner',
    ]
    for (const type of HOMEPAGE_SECTION_TYPES) {
      const hides = CASES[type].some((c) => c.willHide)
      expect(hides, type).toBe(!cannotHide.includes(type))
    }
  })
})

describe('counts and summaries', () => {
  it('counts the collection behind each band', () => {
    const conference = bareConference({
      featuredSpeakers: [{ _id: 'a' }, { _id: 'b' }] as never,
      organizers: [{ _id: 'o1', name: 'A' }] as never,
      featuredGalleryImages: [
        { _id: 'g1' },
        { _id: 'g2' },
        { _id: 'g3' },
      ] as never,
      vanityMetrics: [{ label: 'x', value: '1' }] as never,
      programDate: PAST,
      schedules: scheduleWith('confirmed'),
    })
    const countOf = (section: HomepageSection) =>
      sectionContentStatus(section, conference).count

    expect(countOf({ _key: '1', _type: 'homepageFeaturedSpeakers' })).toBe(2)
    expect(countOf({ _key: '2', _type: 'homepageOrganizers' })).toBe(1)
    expect(countOf({ _key: '3', _type: 'homepageGallery' })).toBe(3)
    expect(countOf({ _key: '4', _type: 'homepageMetrics' })).toBe(1)
    expect(countOf({ _key: '5', _type: 'homepageProgramHighlights' })).toBe(1)
    // Not collection-backed — a fabricated number would be worse than none.
    expect(countOf({ _key: '6', _type: 'homepageHero' })).toBeNull()
    expect(countOf({ _key: '7', _type: 'homepageVenue' })).toBeNull()
  })

  it('summarises sponsors the way the band groups them', () => {
    const conference = bareConference({
      sponsors: [
        {
          sponsor: { _id: '1', name: 'A', website: 'https://a.test' },
          tier: { title: 'Gold', tagline: '' },
        },
        {
          sponsor: { _id: '2', name: 'B', website: 'https://b.test' },
          tier: { title: 'Silver', tagline: '' },
        },
        // Two `special` tiers collapse into ONE heading in the band, so they
        // must collapse in the summary too.
        {
          sponsor: { _id: '3', name: 'C', website: 'https://c.test' },
          tier: { title: 'Community', tagline: '', tierType: 'special' },
        },
        {
          sponsor: { _id: '4', name: 'D', website: 'https://d.test' },
          tier: { title: 'Media', tagline: '', tierType: 'special' },
        },
      ] as never,
    })
    const status = sectionContentStatus(
      { _key: 's', _type: 'homepageSponsors' },
      conference,
    )
    expect(status.summary).toBe('4 sponsors in 3 tiers')
    expect(status.kind).toBe('ready')
  })

  it('flags sponsors that are not in any tier — no tier, no logo', () => {
    const status = sectionContentStatus(
      { _key: 's', _type: 'homepageSponsors' },
      bareConference({
        sponsors: [
          {
            sponsor: { _id: '1', name: 'A', website: 'https://a.test' },
            tier: null,
          },
        ] as never,
      }),
    )
    expect(status.kind).toBe('degraded')
    expect(status.summary).toBe('1 sponsor, none in a tier')
  })

  it('says what an empty sponsors band actually looks like in each case', () => {
    const withPitch = sectionContentStatus(
      { _key: 's', _type: 'homepageSponsors' },
      bareConference(),
    )
    expect(withPitch.reason).toContain('Become a Sponsor')

    const noPitch = sectionContentStatus(
      { _key: 's', _type: 'homepageSponsors', showCta: false },
      bareConference(),
    )
    expect(noPitch.reason).toContain('empty band')

    // Post-event suppresses the pitch too (SectionRenderer.tsx:398-410), so an
    // old edition with no sponsors is an empty band even with `showCta` unset.
    const postEvent = sectionContentStatus(
      { _key: 's', _type: 'homepageSponsors' },
      bareConference({ startDate: PAST, endDate: PAST }),
    )
    expect(postEvent.reason).toContain('empty band')
  })
})

describe('manage links', () => {
  it('points every band at the surface that owns its content', () => {
    const conference = bareConference()
    const sourceOf = (section: HomepageSection): SectionContentSourceId =>
      sectionContentStatus(section, conference).source.id

    expect(sourceOf({ _key: '1', _type: 'homepageFeaturedSpeakers' })).toBe(
      'featured-speakers',
    )
    expect(sourceOf({ _key: '2', _type: 'homepageSponsors' })).toBe('sponsors')
    expect(sourceOf({ _key: '3', _type: 'homepageGallery' })).toBe('gallery')
    expect(sourceOf({ _key: '4', _type: 'homepageMetrics' })).toBe(
      'vanity-metrics',
    )
    expect(sourceOf({ _key: '5', _type: 'homepageVenue' })).toBe('venue')
    expect(sourceOf({ _key: '6', _type: 'homepageProgramHighlights' })).toBe(
      'programme',
    )
  })

  it('follows the FAQ source toggle rather than assuming one', () => {
    const conference = bareConference()
    expect(
      sectionContentStatus({ _key: 'q', _type: 'homepageFaq' }, conference)
        .source.id,
    ).toBe('section-config')
    expect(
      sectionContentStatus(
        { _key: 'q', _type: 'homepageFaq', source: 'ticketFaqs' },
        conference,
      ).source.id,
    ).toBe('ticket-faqs')
  })

  it('sends the countdown to the dates unless the block overrides them', () => {
    const conference = bareConference({ startDate: FUTURE })
    expect(
      sectionContentStatus(
        { _key: 'd', _type: 'homepageCountdown' },
        conference,
      ).source.id,
    ).toBe('dates')
    expect(
      sectionContentStatus(
        { _key: 'd', _type: 'homepageCountdown', targetOverride: FUTURE },
        conference,
      ).source.id,
    ).toBe('section-config')
  })

  it('offers a link for every source that has one, and none for composer-local content', () => {
    for (const src of Object.values(CONTENT_SOURCES)) {
      expect(src.label.length).toBeGreaterThan(0)
      expect(src.manageLabel.length).toBeGreaterThan(0)
      if (src.href !== null) expect(src.href.startsWith('/admin/')).toBe(true)
    }
    expect(CONTENT_SOURCES['section-config'].href).toBeNull()
    expect(
      sectionContentStatus(
        { _key: 'r', _type: 'homepageRichText', content: [] },
        bareConference(),
      ).manage,
    ).toBeNull()
    expect(
      sectionContentStatus(
        { _key: 'f', _type: 'homepageFeaturedSpeakers' },
        bareConference(),
      ).manage,
    ).toEqual({
      label: 'Choose speakers',
      href: '/admin/marketing/featured',
    })
  })
})

describe('what it deliberately does not answer', () => {
  /**
   * The visibility toggle and the cancelled/archived override both blank a
   * section on the live page, and neither is a statement about CONTENT. The
   * renderer applies them above `renderSection`; callers do the same. If this
   * module folded them in, "add speakers to fix this" would appear on a band
   * that is hidden because the organizer hid it.
   */
  it('ignores the hidden flag', () => {
    const conference = bareConference({
      featuredSpeakers: [{ _id: 'a' }] as never,
    })
    expect(
      sectionContentStatus(
        { _key: 'f', _type: 'homepageFeaturedSpeakers', hidden: true },
        conference,
      ),
    ).toEqual(
      sectionContentStatus(
        { _key: 'f', _type: 'homepageFeaturedSpeakers' },
        conference,
      ),
    )
  })

  it('ignores the cancelled/archived page override', () => {
    const conference = bareConference({
      lifecycleStatus: 'cancelled',
      venueName: 'Grieghallen',
    })
    expect(
      sectionContentStatus({ _key: 'v', _type: 'homepageVenue' }, conference)
        .willHide,
    ).toBe(false)
    // …even though the page itself renders only the notice.
    const { container } = render(
      <HomepageSectionRenderer
        sections={[{ _key: 'v', _type: 'homepageVenue' }]}
        conference={conference}
      />,
    )
    expect(container.textContent).toContain('cancelled')
  })
})

describe('time-dependent guards', () => {
  it('takes an injected clock so a preview can ask at a chosen instant', () => {
    const conference = bareConference({ startDate: '2030-06-01' })
    const section: HomepageSection = { _key: 'd', _type: 'homepageCountdown' }
    const target = Date.UTC(2030, 5, 1, 12)

    expect(
      sectionContentStatus(section, conference, { now: target - 1 }).willHide,
    ).toBe(false)
    // The component hides at `remaining <= 0`, so the target instant itself is
    // already too late.
    expect(
      sectionContentStatus(section, conference, { now: target }).willHide,
    ).toBe(true)
  })

  it('anchors a bare date at noon UTC, like the renderer does', () => {
    const conference = bareConference({ startDate: '2030-06-01' })
    const justBeforeUtcMidnight = Date.UTC(2030, 5, 1, 6)
    // A midnight-anchored parse would call this "passed"; the house anchoring
    // says the countdown is still running.
    expect(
      sectionContentStatus(
        { _key: 'd', _type: 'homepageCountdown' },
        conference,
        { now: justBeforeUtcMidnight },
      ).willHide,
    ).toBe(false)
  })
})

/**
 * Same hazard as `editor.ts` and `variants.ts` (see the twin tests there): this
 * module is reachable from SERVER components through the composer and the
 * preview route, and a single value import from a client-only package puts that
 * package's React context in the RSC module graph — the production build then
 * dies collecting page data with `createContext is not a function`. Invisible to
 * typecheck and to every other test, so it is asserted on the PARSED module
 * graph. `import type` is erased and therefore absent from the result.
 */
/**
 * Located from the repo root rather than from `import.meta.url`: under the
 * jsdom environment this file's `import.meta.url` is served from
 * `http://localhost:3000/`, so the sibling tests' `new URL('./x.ts', …)` trick
 * resolves to an HTTP URL that `fs` cannot read. A wrong path here fails the
 * test loudly (`readFile` throws) rather than silently asserting nothing.
 */
const MODULE_PATH = 'src/lib/homepage/contentStatus.ts'

describe('server safety', () => {
  it('imports no package, and only the one sibling it cannot inline', async () => {
    const path = join(process.cwd(), MODULE_PATH)
    const imports = findRuntimeModuleImports(await readFile(path, 'utf8'), path)
    // Stricter than `editor.ts`'s guard, which allows any relative sibling:
    // the rich-text sanitizer is the ONE rule too large to transcribe, and
    // everything else in this module is an inlined guard by design.
    expect(imports.map((entry) => entry.specifier)).toEqual(['./richText'])
  })
})
