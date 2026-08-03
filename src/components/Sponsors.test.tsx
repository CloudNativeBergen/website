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
  const actual =
    await importOriginal<typeof import('@/lib/sponsor/utils')>()
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
    sponsor: { _id: 's-1', name: 'Acme', website: 'https://acme.example.com', logo: logo('ACME', '#2563eb') },
    tier: { title: 'Ingress', tierType: 'standard' },
  },
  {
    _id: 'cs-2',
    sponsor: { _id: 's-2', name: 'Tech', website: 'https://tech.example.com', logo: logo('TECH', '#10b981') },
    tier: { title: 'Ingress', tierType: 'standard' },
  },
  {
    _id: 'cs-3',
    sponsor: { _id: 's-3', name: 'Cloud', website: 'https://cloud.example.com', logo: logo('CLOUD', '#8b5cf6') },
    tier: { title: 'Pod', tierType: 'standard' },
  },
] as unknown as ConferenceSponsor[]

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
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders the tier-grouped wall without the CTA', () => {
    const { container } = render(
      <Sponsors
        sponsors={sponsors}
        conference={makeConference()}
        showCTA={false}
      />,
    )
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders the CTA alone when there are no sponsors', () => {
    const { container } = render(
      <Sponsors sponsors={[]} conference={makeConference()} />,
    )
    expect(container.innerHTML).toMatchSnapshot()
  })

  it('renders the mailto CTA when the conference sells no tiers', () => {
    const { container } = render(
      <Sponsors
        sponsors={[]}
        conference={makeConference({ sponsorTiers: [] })}
      />,
    )
    expect(container.innerHTML).toMatchSnapshot()
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
    expect(container.innerHTML).toMatchSnapshot()
  })
})
