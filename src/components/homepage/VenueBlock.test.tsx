/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

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

import { VenueBlock } from './VenueBlock'
import type { VenueSection } from '@/lib/homepage/sections'
import type { Conference } from '@/lib/conference/types'

afterEach(cleanup)

function makeConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conf-1',
    title: 'Cloud Native Days Bergen',
    venueName: 'Grieghallen',
    venueAddress: 'Edvard Griegs plass 1\n5015 Bergen\nNorway',
    ...overrides,
  } as unknown as Conference
}

function section(overrides: Partial<VenueSection> = {}): VenueSection {
  return { _key: 'v', _type: 'homepageVenue', ...overrides }
}

function renderBand(
  sectionOverrides: Partial<VenueSection> = {},
  conferenceOverrides: Partial<Conference> = {},
) {
  return render(
    <VenueBlock
      section={section(sectionOverrides)}
      conference={makeConference(conferenceOverrides)}
    />,
  )
}

/**
 * BACK-COMPAT TRIPWIRE. Captured from the PRE-VARIANT component: the DEFAULT
 * (`card`) rendering is what the live conference sites get. A diff here means
 * the default path regressed — fix the code, never `vitest -u`.
 */
describe('VenueBlock — default (card) markup is frozen', () => {
  it('renders the centred card with a directions button', () => {
    const { container } = renderBand({
      heading: 'Where to find us',
      description:
        'In the heart of Bergen, a four-minute walk from the Bybanen stop.',
    })
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders the house heading when the section configures none', () => {
    const { container } = renderBand()
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders nothing without a venue name or address', () => {
    const { container } = renderBand(
      {},
      { venueName: undefined, venueAddress: undefined },
    )
    expect(container.innerHTML).toBe('')
  })
})

describe('VenueBlock — variant resolution', () => {
  it('renders an explicit `card` identically to no variant at all', () => {
    const { container: implicit } = renderBand()
    const withoutVariant = implicit.innerHTML
    cleanup()
    const { container: explicit } = renderBand({ variant: 'card' })
    expect(explicit.innerHTML).toBe(withoutVariant)
  })

  it('falls back to the card for a variant from the future', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container: implicit } = renderBand()
    const withoutVariant = implicit.innerHTML
    cleanup()
    const { container: unknown } = renderBand({ variant: 'atlas' as 'card' })
    expect(unknown.innerHTML).toBe(withoutVariant)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('VenueBlock — split variant', () => {
  it('keeps every fact the card carries', () => {
    const { container, getByRole } = renderBand({
      variant: 'split',
      heading: 'Where to find us',
      description: 'A four-minute walk from the Bybanen stop.',
    })
    const text = container.textContent ?? ''
    expect(text).toContain('Where to find us')
    expect(text).toContain('A four-minute walk from the Bybanen stop.')
    expect(text).toContain('Grieghallen')
    expect(text).toContain('Edvard Griegs plass 1')
    expect(getByRole('link', { name: /Get directions/ })).toBeTruthy()
  })

  it('lays the copy beside the address card on wide screens', () => {
    const { container } = renderBand({ variant: 'split' })
    const grid = container.querySelector('section > div > div')!
    expect(grid.className).toContain('lg:grid-cols-2')
  })

  it('renders nothing without a venue name or address', () => {
    const { container } = renderBand(
      { variant: 'split' },
      { venueName: undefined, venueAddress: undefined },
    )
    expect(container.innerHTML).toBe('')
  })

  it('still links to directions when only the address is known', () => {
    const { getByRole } = renderBand(
      { variant: 'split' },
      { venueName: undefined },
    )
    expect(getByRole('link', { name: /Get directions/ })).toBeTruthy()
  })
})
