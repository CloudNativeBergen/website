/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

// next/link → a plain anchor: the sponsor CTA renders a `Link` and the
// analytics contract lives in the `data-pirsch-event` attribute on it.
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

// The daily rotation seed is pinned so the deterministic shuffle inside a tier
// is stable across days — otherwise every snapshot below would churn at
// midnight. Everything else in the module is the real implementation.
vi.mock('@/lib/sponsor/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sponsor/utils')>()
  return { ...actual, getDailySeed: () => 20260101 }
})

import { Sponsors } from './Sponsors'
import type { Conference } from '@/lib/conference/types'
import type { ConferenceSponsor } from '@/lib/sponsor/types'

afterEach(cleanup)

const logo = (label: string, fill: string) =>
  `<svg width="100" height="40" xmlns="http://www.w3.org/2000/svg"><text x="10" y="25" fill="${fill}">${label}</text></svg>`

function makeConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conf-1',
    title: 'Test Conf',
    sponsorEmail: 'sponsors@example.com',
    sponsorTiers: [
      {
        _id: 'tier-1',
        title: 'Ingress',
        tierType: 'standard',
        price: [{ _key: 'p1', amount: 100000, currency: 'NOK' }],
      },
      {
        _id: 'tier-2',
        title: 'Pod',
        tierType: 'standard',
        price: [{ _key: 'p2', amount: 25000, currency: 'NOK' }],
      },
    ],
    ...overrides,
  } as unknown as Conference
}

const sponsors = [
  {
    _id: 'cs-1',
    sponsor: {
      _id: 's-1',
      name: 'Acme',
      website: 'https://acme.example.com',
      logo: logo('ACME', '#2563eb'),
    },
    tier: { title: 'Ingress', tierType: 'standard' },
  },
  {
    _id: 'cs-2',
    sponsor: {
      _id: 's-2',
      name: 'Tech',
      website: 'https://tech.example.com',
      logo: logo('TECH', '#10b981'),
    },
    tier: { title: 'Ingress', tierType: 'standard' },
  },
  {
    _id: 'cs-3',
    sponsor: {
      _id: 's-3',
      name: 'Cloud',
      website: 'https://cloud.example.com',
      logo: logo('CLOUD', '#8b5cf6'),
    },
    tier: { title: 'Pod', tierType: 'standard' },
  },
] as unknown as ConferenceSponsor[]

/**
 * React `useId` values (`_r_b_` …) are allocation-order dependent, so the
 * conference mark's gradient id shifts whenever a test is added above. Pin it
 * so these assertions compare MARKUP, not render bookkeeping.
 */
function stable(markup: string): string {
  return markup.replace(/_r_[0-9a-z]+_/g, '_rid_')
}

/**
 * BACK-COMPAT TRIPWIRE. These snapshots were generated from the pre-variant
 * component and pin the DEFAULT (`tiers`) rendering byte-for-byte: three live
 * conference sites store no variant and must keep the markup they have today.
 * A diff here means the default path regressed — fix the code, never `-u`.
 */
describe('Sponsors — default (tiers) markup is frozen', () => {
  it('renders the tier-grouped wall with the sponsor CTA', () => {
    const { container } = render(
      <Sponsors sponsors={sponsors} conference={makeConference()} />,
    )
    expect(stable(container.innerHTML)).toMatchSnapshot()
  })

  it('renders the tier-grouped wall without the CTA', () => {
    const { container } = render(
      <Sponsors
        sponsors={sponsors}
        conference={makeConference()}
        showCTA={false}
      />,
    )
    expect(stable(container.innerHTML)).toMatchSnapshot()
  })

  it('renders the CTA alone when there are no sponsors', () => {
    const { container } = render(
      <Sponsors sponsors={[]} conference={makeConference()} />,
    )
    expect(stable(container.innerHTML)).toMatchSnapshot()
  })

  it('renders the mailto CTA when the conference sells no tiers', () => {
    const { container } = render(
      <Sponsors
        sponsors={[]}
        conference={makeConference({ sponsorTiers: [] })}
      />,
    )
    expect(stable(container.innerHTML)).toMatchSnapshot()
  })

  it('renders tenant copy overrides', () => {
    const { container } = render(
      <Sponsors
        sponsors={sponsors}
        conference={makeConference()}
        heading="Our partners"
        description="The organisations behind the event."
        ctaHeading="Partner with us"
        ctaDescription="Reach the practitioners who run these systems."
      />,
    )
    expect(stable(container.innerHTML)).toMatchSnapshot()
  })

  it('renders an explicit `tiers` identically to no variant at all', () => {
    const { container: implicit } = render(
      <Sponsors sponsors={sponsors} conference={makeConference()} />,
    )
    const withoutVariant = stable(implicit.innerHTML)
    cleanup()
    const { container: explicit } = render(
      <Sponsors
        sponsors={sponsors}
        conference={makeConference()}
        variant="tiers"
      />,
    )
    expect(stable(explicit.innerHTML)).toBe(withoutVariant)
  })

  it('falls back to the tiered wall for a variant from the future', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container: implicit } = render(
      <Sponsors sponsors={sponsors} conference={makeConference()} />,
    )
    const withoutVariant = stable(implicit.innerHTML)
    cleanup()
    const { container: unknown } = render(
      <Sponsors
        sponsors={sponsors}
        conference={makeConference()}
        variant={'hologram' as 'tiers'}
      />,
    )
    expect(stable(unknown.innerHTML)).toBe(withoutVariant)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('Sponsors — logo-wall variant', () => {
  it('drops every tier heading while keeping every sponsor', () => {
    const { container, queryByText } = render(
      <Sponsors
        sponsors={sponsors}
        conference={makeConference()}
        variant="logo-wall"
      />,
    )
    expect(queryByText('Ingress')).toBeNull()
    expect(queryByText('Pod')).toBeNull()
    expect(container.querySelectorAll('h3')).toHaveLength(1) // the CTA card only
    expect(container.querySelectorAll('a[target="_blank"]')).toHaveLength(
      sponsors.length,
    )
  })

  it('gives every logo the same cell, in one grid', () => {
    const { container } = render(
      <Sponsors
        sponsors={sponsors}
        conference={makeConference()}
        variant="logo-wall"
      />,
    )
    const cells = Array.from(
      container.querySelectorAll('a[target="_blank"]'),
    ).map((a) => a.closest('div')!.className)
    expect(new Set(cells).size).toBe(1)
  })

  it('orders by tier value and keeps the daily rotation inside a tier', () => {
    const { container } = render(
      <Sponsors
        sponsors={sponsors}
        conference={makeConference()}
        variant="logo-wall"
      />,
    )
    const names = Array.from(
      container.querySelectorAll('a[target="_blank"]'),
    ).map((a) => a.getAttribute('aria-label'))
    // Ingress (100 000) before Pod (25 000); the two Ingress sponsors appear in
    // whatever order the pinned daily seed produced, never alphabetically.
    expect(names[2]).toBe('Visit Cloud website')
    expect(new Set(names.slice(0, 2))).toEqual(
      new Set(['Visit Acme website', 'Visit Tech website']),
    )
  })

  it('keeps the sponsor CTA card byte-identical to the tiered variant', () => {
    const cta = (markup: string) =>
      stable(markup).slice(stable(markup).indexOf('mt-20'))

    const { container: tiered } = render(
      <Sponsors sponsors={sponsors} conference={makeConference()} />,
    )
    const tieredCta = cta(tiered.innerHTML)
    cleanup()
    const { container: wall } = render(
      <Sponsors
        sponsors={sponsors}
        conference={makeConference()}
        variant="logo-wall"
      />,
    )
    expect(cta(wall.innerHTML)).toBe(tieredCta)
  })

  it('still honours showCTA as an independent toggle', () => {
    const { queryByText } = render(
      <Sponsors
        sponsors={sponsors}
        conference={makeConference()}
        variant="logo-wall"
        showCTA={false}
      />,
    )
    expect(queryByText('View Sponsorship Packages')).toBeNull()
  })

  it('keeps the tenant copy contract of the default band', () => {
    const { getByText } = render(
      <Sponsors
        sponsors={sponsors}
        conference={makeConference()}
        variant="logo-wall"
        heading="Our partners"
        description="The organisations behind the event."
      />,
    )
    expect(getByText('Our partners')).toBeTruthy()
    expect(getByText('The organisations behind the event.')).toBeTruthy()
  })
})
