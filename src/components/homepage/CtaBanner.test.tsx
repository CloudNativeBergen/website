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

import { CtaBanner } from './CtaBanner'
import type { CtaBannerSection } from '@/lib/homepage'

afterEach(cleanup)

function section(overrides: Partial<CtaBannerSection> = {}): CtaBannerSection {
  return {
    _key: 'cta',
    _type: 'homepageCtaBanner',
    heading: 'Early-bird tickets are on sale',
    body: 'Two days at Grieghallen, 27–28 October. Prices go up on 1 September.',
    buttonLabel: 'Get your ticket',
    buttonHref: '/tickets',
    ...overrides,
  } as CtaBannerSection
}

function renderBand(overrides: Partial<CtaBannerSection> = {}) {
  return render(<CtaBanner section={section(overrides)} />)
}

/**
 * BACK-COMPAT TRIPWIRE. Captured from the PRE-VARIANT component: the DEFAULT
 * (`plain`) rendering is what the live conference sites get. A diff here means
 * the default path regressed — fix the code, never `vitest -u`.
 */
describe('CtaBanner — default (plain) markup is frozen', () => {
  it('renders heading, body and the single house button', () => {
    const { container } = renderBand()
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders a heading-only banner', () => {
    const { container } = renderBand({ body: undefined })
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('omits the button when either half of the link is missing', () => {
    const { container } = renderBand({ buttonHref: undefined })
    expect(container.querySelector('a')).toBeNull()
  })
})

describe('CtaBanner — variant resolution', () => {
  it('renders an explicit `plain` identically to no variant at all', () => {
    const { container: implicit } = renderBand()
    const withoutVariant = implicit.innerHTML
    cleanup()
    const { container: explicit } = renderBand({ variant: 'plain' })
    expect(explicit.innerHTML).toBe(withoutVariant)
  })

  it('falls back to plain for a variant from the future', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container: implicit } = renderBand()
    const withoutVariant = implicit.innerHTML
    cleanup()
    const { container: unknown } = renderBand({ variant: 'neon' as 'plain' })
    expect(unknown.innerHTML).toBe(withoutVariant)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('CtaBanner — panel variant', () => {
  it('carries the same copy and the same single button', () => {
    const { container, getAllByRole } = renderBand({ variant: 'panel' })
    const text = container.textContent ?? ''
    expect(text).toContain('Early-bird tickets are on sale')
    expect(text).toContain('Prices go up on 1 September.')
    const links = getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('/tickets')
  })

  it('boxes the content in a contained gradient panel', () => {
    const { container } = renderBand({ variant: 'panel' })
    const panel = container.querySelector('section > div > div')!
    expect(panel.className).toContain('rounded-2xl')
    expect(panel.className).toContain('ring-1')
    // Contained, not full-bleed: the panel never paints the section itself.
    expect(container.querySelector('section')!.className).not.toContain('bg-')
  })

  it('omits the button when either half of the link is missing', () => {
    const { container } = renderBand({
      variant: 'panel',
      buttonLabel: undefined,
    })
    expect(container.querySelector('a')).toBeNull()
  })
})
