/**
 * @vitest-environment jsdom
 */
import { render, cleanup, screen } from '@testing-library/react'

const conference = {
  _id: 'conf',
  title: 'Conf',
  startDate: '2026-11-20',
  endDate: '2026-11-21',
  sponsorRevenueGoal: 500000,
}
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({ conference, error: null }),
}))
vi.mock('@/lib/auth', () => ({
  getAuthSession: async () => ({ speaker: { _id: 'me' } }),
}))
vi.mock('@/components/admin', () => ({
  ErrorDisplay: () => null,
  AdminPageHeader: ({ actions }: { actions?: React.ReactNode }) => actions,
}))
const overviewProps = vi.fn()
vi.mock('@/components/admin/sponsor/SponsorOverview', () => ({
  SponsorOverview: (props: unknown) => {
    overviewProps(props)
    return null
  },
}))
vi.mock('@/components/admin/sponsor/SponsorEmailAction', () => ({
  SponsorEmailAction: () => <button type="button">Email sponsors</button>,
}))

import AdminSponsors from '@/app/(admin)/admin/sponsors/page'
import { ADMIN_DESTINATIONS } from '@/lib/admin/registry'
import { SPONSOR_PAGE_TITLES } from '@/lib/sponsor-crm/labels'

afterEach(cleanup)

describe('/admin/sponsors', () => {
  it('passes the signed-in organizer, the goal and the event window', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-29T12:00:00Z') })
    render(await AdminSponsors())
    expect(overviewProps).toHaveBeenCalledWith({
      organizerId: 'me',
      revenueGoal: 500000,
      showBeforeEvent: true,
    })
    vi.useRealTimers()
  })

  it('hides "Before the event" outside the six-week window', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-01T12:00:00Z') })
    render(await AdminSponsors())
    expect(overviewProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ showBeforeEvent: false }),
    )
    vi.useRealTimers()
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
  // The overview's link row reads SPONSOR_PAGE_TITLES directly
  // (SponsorOverview); the command palette must use the same names.
  it('match the command palette registry', () => {
    for (const [segment, title] of Object.entries(SPONSOR_PAGE_TITLES)) {
      const href = `/admin/sponsors/${segment}`
      expect(ADMIN_DESTINATIONS.find((d) => d.href === href)?.title, href).toBe(
        title,
      )
    }
  })
})
