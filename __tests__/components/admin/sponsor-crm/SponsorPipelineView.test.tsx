/**
 * @vitest-environment jsdom
 */
import { render, screen, cleanup } from '@testing-library/react'
import { mockSponsor } from '@/__mocks__/sponsor-data'
import {
  SponsorPipelineView,
  type SponsorPipelineFormData,
} from '@/components/admin/sponsor-crm/SponsorPipelineView'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

vi.mock('@/components/admin/sponsor/SponsorActivityTimeline', () => ({
  __esModule: true,
  SponsorActivityTimeline: () => <div data-testid="activity-timeline" />,
}))

const defaultFormData: SponsorPipelineFormData = {
  sponsorId: 'sponsor-1',
  name: 'Sonat AS',
  website: 'https://sonat.no',
  logo: '<svg/>',
  logoBright: null,
  orgNumber: '987654321',
  address: 'Bergen, Norway',
  blueskyHandle: '',
  linkedinUrl: '',
  tierId: 'tier-1',
  addonIds: [],
  contractStatus: 'registration-sent',
  status: 'closed-won',
  invoiceStatus: 'not-sent',
  invoiceDueAt: '',
  contractValue: '25000',
  contractCurrency: 'NOK',
  tags: [],
  assignedTo: 'user-1',
}

function renderPipelineView(sponsor: SponsorForConferenceExpanded | null) {
  return render(
    <SponsorPipelineView
      formData={defaultFormData}
      onFormDataChange={vi.fn()}
      sponsor={sponsor}
      availableSponsors={[]}
      regularTiers={[]}
      addonTiers={[]}
      organizers={[]}
      isPending={false}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
      onOpenView={vi.fn()}
    />,
  )
}

describe('SponsorPipelineView — contract value locking', () => {
  afterEach(cleanup)

  it('keeps Contract Value editable when contractStatus is registration-sent', () => {
    renderPipelineView(
      mockSponsor({
        status: 'closed-won',
        contractStatus: 'registration-sent',
        contractValue: 25000,
      }),
    )

    const input = screen.getByRole('spinbutton')
    expect(input).not.toBeDisabled()
    expect(
      screen.queryByText('Locked — contract has been sent'),
    ).not.toBeInTheDocument()
  })

  it('keeps Contract Value editable when contractStatus is contract-sent but persisted contractValue is missing', () => {
    renderPipelineView(
      mockSponsor({
        status: 'closed-won',
        contractStatus: 'contract-sent',
        contractValue: undefined,
      }),
    )

    const input = screen.getByRole('spinbutton')
    expect(input).not.toBeDisabled()
    expect(
      screen.queryByText('Locked — contract has been sent'),
    ).not.toBeInTheDocument()
  })

  it('locks Contract Value when contractStatus is contract-sent and persisted contractValue is positive', () => {
    renderPipelineView(
      mockSponsor({
        status: 'closed-won',
        contractStatus: 'contract-sent',
        contractValue: 25000,
      }),
    )

    const input = screen.getByRole('spinbutton')
    expect(input).toBeDisabled()
    expect(
      screen.getByText('Locked — contract has been sent'),
    ).toBeInTheDocument()
  })

  it('locks Contract Value when contractStatus is contract-signed and persisted contractValue is positive', () => {
    renderPipelineView(
      mockSponsor({
        status: 'closed-won',
        contractStatus: 'contract-signed',
        contractValue: 25000,
      }),
    )

    const input = screen.getByRole('spinbutton')
    expect(input).toBeDisabled()
    expect(
      screen.getByText('Locked — contract has been sent'),
    ).toBeInTheDocument()
  })
})
