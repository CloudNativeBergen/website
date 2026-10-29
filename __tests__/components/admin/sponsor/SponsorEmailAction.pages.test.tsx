/**
 * @vitest-environment jsdom
 *
 * "Email sponsors" is the one broadcast action on the contacts and tiers
 * pages (the overview is covered in `__tests__/app/admin/sponsors`).
 */
import { render, screen, cleanup } from '@testing-library/react'
import type { Conference } from '@/lib/conference/types'

vi.mock('@/components/admin/sponsor/SponsorEmailAction', () => ({
  SponsorEmailAction: () => <button type="button">Email sponsors</button>,
}))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))
vi.mock('@/components/admin/AdminHeaderActions', () => ({
  AdminHeaderActions: () => null,
}))
vi.mock('@/components/admin', () => ({
  AdminPageHeader: ({ actions }: { actions?: React.ReactNode }) => actions,
}))
vi.mock('@/components/admin/sponsor/SponsorTierEditor', () => ({
  SponsorTierEditor: () => null,
}))
vi.mock('@/components/admin/sponsor/SponsorTierManagement', () => ({
  SponsorTierManagement: () => null,
}))
vi.mock('@/components/admin/EditConferenceCard', () => ({
  EditConferenceCard: () => null,
}))

import { SponsorContactActions } from '@/components/admin/sponsor/SponsorContactActions'
import { SponsorTiersPageClient } from '@/components/admin/sponsor/SponsorTiersPageClient'

afterEach(cleanup)

const conference = { _id: 'conf', title: 'Conf' } as unknown as Conference

describe('Email sponsors on every sponsor page that had a broadcast', () => {
  it('renders on the contacts page', () => {
    render(
      <SponsorContactActions visibleSponsors={[]} conference={conference} />,
    )
    expect(
      screen.getAllByRole('button', { name: 'Email sponsors' }),
    ).toHaveLength(1)
  })

  it('renders on the tiers page', () => {
    render(
      <SponsorTiersPageClient
        conference={conference}
        domain="example.test"
        sponsors={[]}
        sponsorTiers={[]}
        sponsorsByTier={{}}
        sortedTierNames={[]}
      />,
    )
    expect(
      screen.getAllByRole('button', { name: 'Email sponsors' }),
    ).toHaveLength(1)
  })
})
