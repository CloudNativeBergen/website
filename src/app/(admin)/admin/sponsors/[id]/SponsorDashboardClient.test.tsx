/**
 * @vitest-environment jsdom
 *
 * `?view=<tab>` on the sponsor page scrolls to that section; it must not pop
 * the record modal open. Only "Open record" and "Manage" open it.
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Conference } from '@/lib/conference/types'
import { SponsorDashboardClient } from './SponsorDashboardClient'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('view=contract'),
}))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null }) }))
vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({}),
    sponsor: {
      crm: {
        getById: { useQuery: () => ({ data: { _id: 'sfc-1' } }) },
        activities: { list: { useQuery: () => ({ data: [] }) } },
      },
    },
  },
}))
vi.mock('@/components/admin/sponsor-crm/SponsorCRMForm', () => ({
  SponsorCRMForm: () => <div data-testid="record" />,
}))
vi.mock('@/components/admin', () => ({ SponsorSendModal: () => null }))
vi.mock('@/components/admin/sponsor/SponsorSendModal', () => ({
  sponsorFromAddress: () => '',
}))
vi.mock('@/components/admin/sponsor-crm/widgets/SponsorDetailHeader', () => ({
  SponsorDetailHeader: ({ onOpenRecord }: { onOpenRecord: () => void }) => (
    <button onClick={onOpenRecord}>Open record</button>
  ),
}))
vi.mock('@/components/admin/sponsor-crm/widgets/SponsorOverviewWidget', () => ({
  SponsorOverviewWidget: () => null,
}))
vi.mock('@/components/admin/sponsor-crm/widgets/SponsorPhaseWidget', () => ({
  SponsorPhaseWidget: () => null,
}))
vi.mock('@/components/admin/sponsor-crm/widgets/SponsorFollowUpWidget', () => ({
  SponsorFollowUpWidget: () => null,
}))
vi.mock('@/components/admin/sponsor-crm/widgets/SponsorContactsWidget', () => ({
  SponsorContactsWidget: () => null,
}))
vi.mock('@/components/admin/sponsor-crm/widgets/SponsorContractWidget', () => ({
  SponsorContractWidget: () => null,
}))
vi.mock('@/components/admin/sponsor-crm/widgets/SponsorRenewalWidget', () => ({
  SponsorRenewalWidget: () => null,
}))
vi.mock(
  '@/components/admin/sponsor-crm/widgets/SponsorActivityFeedWidget',
  () => ({ SponsorActivityFeedWidget: () => null }),
)

afterEach(cleanup)

it('scrolls to the section for ?view=contract instead of opening the record', () => {
  const scrollIntoView = vi.fn()
  Element.prototype.scrollIntoView = scrollIntoView
  render(
    <SponsorDashboardClient
      sponsorId="sfc-1"
      conference={{ _id: 'conf' } as Conference}
      domain="example.test"
      initialView="contract"
    />,
  )
  expect(screen.queryByTestId('record')).not.toBeInTheDocument()
  expect(scrollIntoView).toHaveBeenCalledTimes(1)
  expect(scrollIntoView.mock.contexts[0]).toHaveProperty('id', 'contract')

  fireEvent.click(screen.getByText('Open record'))
  expect(screen.getByTestId('record')).toBeInTheDocument()
})
