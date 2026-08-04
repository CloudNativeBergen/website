/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import { MetricsBlock } from './MetricsBlock'
import type { MetricsSection } from '@/lib/homepage'
import type { Conference } from '@/lib/conference/types'

afterEach(cleanup)

function makeConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conf-1',
    title: 'Cloud Native Days Bergen',
    vanityMetrics: [
      { label: 'Attendees', value: '480' },
      { label: 'Sessions', value: '32' },
      { label: 'Speakers', value: '28' },
      { label: 'Workshops', value: '4' },
      { label: 'Tracks', value: '3' },
      { label: 'Sponsors', value: '12' },
    ],
    ...overrides,
  } as unknown as Conference
}

function section(overrides: Partial<MetricsSection> = {}): MetricsSection {
  return { _key: 'm', _type: 'homepageMetrics', ...overrides }
}

function renderBand(
  sectionOverrides: Partial<MetricsSection> = {},
  conferenceOverrides: Partial<Conference> = {},
) {
  return render(
    <MetricsBlock
      section={section(sectionOverrides)}
      conference={makeConference(conferenceOverrides)}
    />,
  )
}

/**
 * BACK-COMPAT TRIPWIRE. Captured from the PRE-VARIANT component: the DEFAULT
 * (`row`) rendering is what the live conference sites get, and it must not
 * move. A diff here means the default path regressed — fix the code, never
 * `vitest -u`.
 */
describe('MetricsBlock — default (row) markup is frozen', () => {
  it('renders the plain row of numbers with a heading', () => {
    const { container } = renderBand({ heading: 'The 2025 edition in numbers' })
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders without a heading', () => {
    const { container } = renderBand()
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders nothing without metrics', () => {
    const { container } = renderBand({}, { vanityMetrics: [] })
    expect(container.innerHTML).toBe('')
  })

  it('caps the row at six metrics', () => {
    const { container } = renderBand(
      {},
      {
        vanityMetrics: [
          ...makeConference().vanityMetrics!,
          { label: 'Volunteers', value: '19' },
        ],
      },
    )
    expect(container.querySelectorAll('dt')).toHaveLength(6)
  })
})

describe('MetricsBlock — variant resolution', () => {
  it('renders an explicit `row` identically to no variant at all', () => {
    const { container: implicit } = renderBand()
    const withoutVariant = implicit.innerHTML
    cleanup()
    const { container: explicit } = renderBand({ variant: 'row' })
    expect(explicit.innerHTML).toBe(withoutVariant)
  })

  it('falls back to the row for a variant from the future', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container: implicit } = renderBand()
    const withoutVariant = implicit.innerHTML
    cleanup()
    const { container: unknown } = renderBand({
      variant: 'hologram' as 'row',
    })
    expect(unknown.innerHTML).toBe(withoutVariant)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('MetricsBlock — band variant', () => {
  it('shows the same numbers and labels as the row', () => {
    const { container } = renderBand({ variant: 'band' })
    const text = container.textContent ?? ''
    for (const metric of makeConference().vanityMetrics!) {
      expect(text).toContain(metric.label)
      expect(text).toContain(metric.value)
    }
  })

  it('paints the band on the SECTION so the tint runs edge to edge', () => {
    const { container } = renderBand({ variant: 'band' })
    const band = container.querySelector('section')!
    // Full-bleed: the tinted surface is the section itself, not an inner box
    // constrained by the Container's max width.
    expect(band.className).toContain('bg-brand-cloud-blue/5')
    expect(band.className).toContain('border-y')
  })

  it('keeps the term before the description in the DOM (valid dl order)', () => {
    const { container } = renderBand({ variant: 'band' })
    const pair = container.querySelector('dl > div')!
    expect(pair.children[0].tagName).toBe('DT')
    expect(pair.children[1].tagName).toBe('DD')
    // ...and flips them visually, so the number reads first.
    expect(pair.className).toContain('flex-col-reverse')
  })

  it('renders nothing without metrics', () => {
    const { container } = renderBand({ variant: 'band' }, { vanityMetrics: [] })
    expect(container.innerHTML).toBe('')
  })
})
