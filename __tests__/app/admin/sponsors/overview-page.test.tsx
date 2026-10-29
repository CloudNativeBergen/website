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
  AdminPageHeader: ({ actions }: { actions?: React.ReactNode }) => actions,
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
vi.mock('@/components/admin/sponsor/SponsorEmailAction', () => ({
  SponsorEmailAction: () => <button type="button">Email sponsors</button>,
}))

import AdminSponsors from '@/app/(admin)/admin/sponsors/page'
import { ADMIN_DESTINATIONS } from '@/lib/admin/registry'
import { SPONSOR_PAGE_TITLES } from '@/lib/sponsor-crm/labels'

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

describe('/admin/sponsors email action', () => {
  it('offers the one "Email sponsors" action', async () => {
    render(await AdminSponsors())
    expect(
      screen.getByRole('button', { name: 'Email sponsors' }),
    ).toBeInTheDocument()
  })
})

describe('sponsor page names (#1704 C2)', () => {
  it('match across the overview cards and the command palette registry', async () => {
    render(await AdminSponsors())
    for (const [segment, title] of Object.entries(SPONSOR_PAGE_TITLES)) {
      const href = `/admin/sponsors/${segment}`
      const card = screen
        .getAllByRole('link')
        .find((a) => a.getAttribute('href') === href)
      expect(card, href).toHaveTextContent(title)
      expect(
        ADMIN_DESTINATIONS.find((d) => d.href === href)?.title,
        href,
      ).toBe(title)
    }
  })
})
