/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import { SaveTheDate } from './SaveTheDate'
import type { SaveTheDateSection } from '@/lib/homepage/sections'
import type { HomepageLifecycle } from '@/lib/homepage/lifecycle'
import type { Conference } from '@/lib/conference/types'

afterEach(cleanup)

/**
 * The band's CONTRACT, pinned here because the admin editor and the Sanity
 * schema both describe it to organizers in prose: the description is EXTRA
 * copy with no derived default. The dates, the venue/city and the countdown
 * are first-class elements of the card, so an empty description must render
 * nothing at all rather than a restatement of the two lines above it — and
 * must never leave a half-built fragment behind when a field is missing.
 */

function makeConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conf-1',
    title: 'Cloud Native Days Bergen',
    organizer: 'CNDN',
    city: 'Bergen',
    country: 'Norway',
    venueName: 'Grieghallen',
    startDate: '2026-10-27',
    endDate: '2026-10-28',
    registrationEnabled: false,
    ...overrides,
  } as unknown as Conference
}

function makeLifecycle(
  overrides: Partial<HomepageLifecycle> = {},
): HomepageLifecycle {
  return {
    stage: 'announced',
    cfp: 'absent',
    tickets: 'unavailable',
    content: {
      hasGallery: false,
      hasFeaturedSpeakers: false,
      hasOrganizers: false,
      hasSponsors: false,
      hasVanityMetrics: false,
      hasProgramme: false,
      hasRecordings: false,
      isFirstEdition: true,
    },
    primaryCta: 'info',
    isOverridden: false,
    ...overrides,
  }
}

function section(
  overrides: Partial<SaveTheDateSection> = {},
): SaveTheDateSection {
  return { _key: 'std', _type: 'homepageSaveTheDate', ...overrides }
}

function renderBand(
  sectionOverrides: Partial<SaveTheDateSection> = {},
  conferenceOverrides: Partial<Conference> = {},
) {
  return render(
    <SaveTheDate
      section={section(sectionOverrides)}
      conference={makeConference(conferenceOverrides)}
      lifecycle={makeLifecycle()}
    />,
  )
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

/** Every leaf element must carry real text — never blank, never a dangling
 * connector left over from a value the conference does not have. */
function expectNoBrokenFragments(container: HTMLElement) {
  const text = container.textContent ?? ''
  expect(text).not.toContain('TBD')
  expect(text).not.toContain('Invalid Date')
  expect(text).not.toContain('undefined')
  expect(text).not.toContain('null')

  for (const el of Array.from(container.querySelectorAll('p, h2, h3, li'))) {
    if (el.querySelector('p, h2, h3, li')) continue
    const leaf = (el.textContent ?? '').trim()
    expect(leaf).not.toBe('')
    // A connector with nothing after it ("in ", "…, ", "27. oktober – ").
    expect(leaf).not.toMatch(/(?:\bin|,|–|-)$/)
    expect(leaf).not.toMatch(/^(?:in\b|,|–)/)
  }
}

describe('SaveTheDate — description', () => {
  it('renders a configured description verbatim', () => {
    const { container } = renderBand({
      description: 'Two days of talks and hallway track by the fjord.',
    })

    expect(container.textContent).toContain(
      'Two days of talks and hallway track by the fjord.',
    )
    expectNoBrokenFragments(container)
  })

  it('adds no copy when the description is empty — the dates and city are not restated', () => {
    const { container } = renderBand({})
    const text = container.textContent ?? ''

    // The card is still complete: dates headline + place line.
    expect(text).toContain('27.–28. oktober 2026')
    expect(text).toContain('Grieghallen, Bergen')

    // ...and each appears exactly ONCE. A derived default built from the dates
    // and the city would duplicate the two lines directly above it.
    expect(occurrences(text, '27.–28. oktober 2026')).toBe(1)
    expect(occurrences(text, 'Bergen')).toBe(1)
    expectNoBrokenFragments(container)
  })

  it('treats a whitespace-only description as empty', () => {
    const { container } = renderBand({ description: '   \n  ' })

    expect(occurrences(container.textContent ?? '', 'Bergen')).toBe(1)
    expectNoBrokenFragments(container)
  })

  it('does not persist or echo a derived description back into the section', () => {
    const configured = section({})
    render(
      <SaveTheDate
        section={configured}
        conference={makeConference()}
        lifecycle={makeLifecycle()}
      />,
    )

    // Render-time only: nothing is written back onto the section document.
    expect(configured.description).toBeUndefined()
  })
})

describe('SaveTheDate — missing conference data', () => {
  it('renders the venue alone when the city is missing', () => {
    const { container } = renderBand({}, { city: '' })
    const text = container.textContent ?? ''

    expect(text).toContain('Grieghallen')
    expect(text).not.toContain('Grieghallen,')
    expectNoBrokenFragments(container)
  })

  it('renders the city alone when the venue is missing', () => {
    const { container } = renderBand({}, { venueName: undefined })
    const text = container.textContent ?? ''

    expect(text).toContain('Bergen')
    expect(text).not.toContain(', Bergen')
    expectNoBrokenFragments(container)
  })

  it('falls back to the conference title when the dates are missing', () => {
    const { container } = renderBand({}, { startDate: '', endDate: '' })
    const text = container.textContent ?? ''

    expect(text).toContain('Cloud Native Days Bergen')
    expect(text).toContain('Grieghallen, Bergen')
    expectNoBrokenFragments(container)
  })

  it('keeps a configured description when the dates are missing', () => {
    const { container } = renderBand(
      { description: 'Dates to be confirmed — the venue is booked.' },
      { startDate: '', endDate: '' },
    )

    expect(container.textContent).toContain(
      'Dates to be confirmed — the venue is booked.',
    )
    expectNoBrokenFragments(container)
  })

  it('renders nothing at all when there are neither dates nor a place', () => {
    const { container } = renderBand(
      {},
      { startDate: '', endDate: '', city: '', venueName: undefined },
    )

    expect(container.innerHTML).toBe('')
  })
})

/**
 * The clock has to be pinned for anything that renders the countdown: the
 * embedded strip reads `Date.now()` on every tick, so an unpinned run would
 * write a different snapshot every second.
 */
const FIXED_NOW = new Date('2026-03-01T12:00:00Z').getTime()

describe('SaveTheDate — variants', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  const roadmapLifecycle = makeLifecycle({ cfp: 'open' })

  function renderVariant(
    sectionOverrides: Partial<SaveTheDateSection> = {},
    conferenceOverrides: Partial<Conference> = {},
  ) {
    return render(
      <SaveTheDate
        section={section(sectionOverrides)}
        conference={makeConference({
          cfpStartDate: '2026-02-01',
          cfpEndDate: '2026-06-15',
          programDate: '2026-08-15',
          ...conferenceOverrides,
        })}
        lifecycle={roadmapLifecycle}
      />,
    )
  }

  /**
   * BACK-COMPAT TRIPWIRE. Captured from the PRE-VARIANT component: the DEFAULT
   * (`card`) rendering is what the live conference sites get. A diff here means
   * the default path regressed — fix the code, never `vitest -u`.
   */
  describe('default (card) markup is frozen', () => {
    it('renders the boxed card with countdown and roadmap', () => {
      const { container } = renderVariant({
        description:
          'Two days of talks, workshops and hallway track on the western fjords.',
      })
      expect(container.innerHTML).toMatchSnapshot()
    })

    it('renders the card without a description', () => {
      const { container } = renderVariant()
      expect(container.innerHTML).toMatchSnapshot()
    })
  })

  describe('variant resolution', () => {
    it('renders an explicit `card` identically to no variant at all', () => {
      const { container: implicit } = renderVariant()
      const withoutVariant = implicit.innerHTML
      cleanup()
      const { container: explicit } = renderVariant({ variant: 'card' })
      expect(explicit.innerHTML).toBe(withoutVariant)
    })

    it('falls back to the card for a variant from the future', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { container: implicit } = renderVariant()
      const withoutVariant = implicit.innerHTML
      cleanup()
      const { container: unknown } = renderVariant({
        variant: 'poster' as 'card',
      })
      expect(unknown.innerHTML).toBe(withoutVariant)
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })
  })

  describe('strip variant', () => {
    it('keeps the dates, the place and the countdown', () => {
      const { container } = renderVariant({ variant: 'strip' })
      const text = container.textContent ?? ''
      expect(text).toContain('27.–28. oktober 2026')
      expect(text).toContain('Grieghallen, Bergen')
      expect(container.querySelector('[role="timer"]')).toBeTruthy()
      expectNoBrokenFragments(container)
    })

    it('drops the roadmap — that is the whole point of the strip', () => {
      const { container: card } = renderVariant()
      expect(card.textContent).toContain('What happens next')
      cleanup()
      const { container: strip } = renderVariant({ variant: 'strip' })
      expect(strip.textContent).not.toContain('What happens next')
    })

    it('keeps the labelled-region contract of the card', () => {
      const { container } = renderVariant({ variant: 'strip' })
      const band = container.querySelector('section')!
      expect(band.getAttribute('aria-labelledby')).toBe('save-the-date-title')
      expect(container.querySelector('#save-the-date-title')).toBeTruthy()
    })

    it('still renders an organizer description', () => {
      const { container } = renderVariant({
        variant: 'strip',
        description: 'Bring a laptop — the workshops are hands-on.',
      })
      expect(container.textContent).toContain(
        'Bring a laptop — the workshops are hands-on.',
      )
      expectNoBrokenFragments(container)
    })

    it('falls back to the title when the dates are not fixed', () => {
      const { container } = renderVariant(
        { variant: 'strip' },
        { startDate: '', endDate: '' },
      )
      expect(container.textContent).toContain('Cloud Native Days Bergen')
      expectNoBrokenFragments(container)
    })

    it('removes itself when there is neither a date nor a place', () => {
      const { container } = renderVariant(
        { variant: 'strip' },
        { startDate: '', endDate: '', city: '', venueName: undefined },
      )
      expect(container.innerHTML).toBe('')
    })
  })
})
