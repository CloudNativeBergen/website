/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import { Countdown } from './Countdown'

/**
 * The band reads `Date.now()` on every tick, so the clock is pinned: without
 * it the snapshots below would re-render one second differently on every run.
 */
const FIXED_NOW = new Date('2026-03-01T12:00:00Z').getTime()
const DAY = 86_400_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

/**
 * BACK-COMPAT TRIPWIRE. Captured from the PRE-VARIANT component: the DEFAULT
 * (`units`) rendering is what the live conference sites get. A diff here means
 * the default path regressed — fix the code, never `vitest -u`.
 */
describe('Countdown — default (units) markup is frozen', () => {
  it('renders the four big unit tiles under a heading', () => {
    const { container } = render(
      <Countdown
        targetMs={FIXED_NOW + 90 * DAY + 5 * 3_600_000}
        heading="Cloud Native Days Bergen starts in"
      />,
    )
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders without a heading', () => {
    const { container } = render(<Countdown targetMs={FIXED_NOW + 3 * DAY} />)
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders the live message once the target has passed', () => {
    const { container } = render(
      <Countdown
        targetMs={FIXED_NOW - 3_600_000}
        heading="Countdown"
        liveMessage="We are live — welcome to Bergen!"
      />,
    )
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('hides itself after the target when no live message is configured', () => {
    const { container } = render(<Countdown targetMs={FIXED_NOW - 1_000} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('Countdown — variant resolution', () => {
  it('renders an explicit `units` identically to no variant at all', () => {
    const { container: implicit } = render(
      <Countdown targetMs={FIXED_NOW + 12 * DAY} heading="Starts in" />,
    )
    const withoutVariant = implicit.innerHTML
    cleanup()
    const { container: explicit } = render(
      <Countdown
        targetMs={FIXED_NOW + 12 * DAY}
        heading="Starts in"
        variant="units"
      />,
    )
    expect(explicit.innerHTML).toBe(withoutVariant)
  })

  it('falls back to the units grid for a variant from the future', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container: implicit } = render(
      <Countdown targetMs={FIXED_NOW + 12 * DAY} heading="Starts in" />,
    )
    const withoutVariant = implicit.innerHTML
    cleanup()
    const { container: unknown } = render(
      <Countdown
        targetMs={FIXED_NOW + 12 * DAY}
        heading="Starts in"
        variant={'flipclock' as 'units'}
      />,
    )
    expect(unknown.innerHTML).toBe(withoutVariant)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('Countdown — strip variant', () => {
  it('puts the whole countdown on ONE line, heading included', () => {
    const { container } = render(
      <Countdown
        targetMs={FIXED_NOW + 12 * DAY + 3 * 3_600_000}
        heading="Doors open in"
        variant="strip"
      />,
    )
    const text = (container.textContent ?? '').replace(/\s+/g, ' ')
    expect(text).toContain('Doors open in')
    expect(text).toContain('12')
    // One timer element, not four stacked unit tiles.
    expect(container.querySelectorAll('[role="timer"]')).toHaveLength(1)
  })

  it('keeps the unit labels readable rather than cryptic', () => {
    const { container } = render(
      <Countdown targetMs={FIXED_NOW + 2 * DAY} variant="strip" />,
    )
    const text = container.textContent ?? ''
    for (const label of ['days', 'hours', 'minutes', 'seconds']) {
      expect(text.toLowerCase()).toContain(label)
    }
  })

  it('is materially shorter than the units grid', () => {
    const { container: units } = render(
      <Countdown targetMs={FIXED_NOW + 2 * DAY} heading="Starts in" />,
    )
    const unitNodes = units.querySelectorAll('div').length
    cleanup()
    const { container: strip } = render(
      <Countdown
        targetMs={FIXED_NOW + 2 * DAY}
        heading="Starts in"
        variant="strip"
      />,
    )
    expect(strip.querySelectorAll('div').length).toBeLessThan(unitNodes)
  })

  it('shows the live message after the target, in the strip chrome', () => {
    const { container } = render(
      <Countdown
        targetMs={FIXED_NOW - 3_600_000}
        liveMessage="We are live — welcome to Bergen!"
        variant="strip"
      />,
    )
    expect(container.textContent).toContain('We are live — welcome to Bergen!')
  })

  it('hides itself after the target when no live message is configured', () => {
    const { container } = render(
      <Countdown targetMs={FIXED_NOW - 1_000} variant="strip" />,
    )
    expect(container.innerHTML).toBe('')
  })
})
