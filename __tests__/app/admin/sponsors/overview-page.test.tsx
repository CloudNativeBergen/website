/**
 * @vitest-environment jsdom
 */
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: { _id: 'conf', title: 'Conf' },
    error: null,
  }),
}))
vi.mock('@/components/admin', () => ({
  ErrorDisplay: () => null,
  AdminPageHeader: () => null,
}))
vi.mock('@/components/admin/sponsor/SponsorDashboardMetrics', () => ({
  SponsorDashboardMetrics: () => null,
}))
vi.mock('@/components/admin/sponsor/SponsorActionItems', () => ({
  SponsorActionItems: () => null,
}))
vi.mock('@/components/admin/sponsor/SponsorActivityTimeline', () => ({
  SponsorActivityTimeline: () => null,
}))
vi.mock('@/components/admin/sponsor/SponsorDashboardBroadcastAction', () => ({
  SponsorDashboardBroadcastAction: () => null,
}))

import AdminSponsors from '@/app/(admin)/admin/sponsors/page'

afterEach(cleanup)

describe('/admin/sponsors quick navigation', () => {
  it('links to the invoices page', async () => {
    render(await AdminSponsors())
    expect(screen.getByRole('link', { name: /invoices/i })).toHaveAttribute(
      'href',
      '/admin/sponsors/invoices',
    )
  })
})
