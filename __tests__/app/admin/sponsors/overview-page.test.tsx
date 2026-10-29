/**
 * @vitest-environment jsdom
 */
import { render, cleanup } from '@testing-library/react'

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
  AdminPageHeader: () => null,
}))
const overviewProps = vi.fn()
vi.mock('@/components/admin/sponsor/SponsorOverview', () => ({
  SponsorOverview: (props: unknown) => {
    overviewProps(props)
    return null
  },
}))
vi.mock('@/components/admin/sponsor/SponsorDashboardBroadcastAction', () => ({
  SponsorDashboardBroadcastAction: () => null,
}))

import AdminSponsors from '@/app/(admin)/admin/sponsors/page'

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
