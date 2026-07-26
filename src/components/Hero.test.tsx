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
