/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { SponsorContactTable } from '@/components/admin/sponsor/SponsorContactTable'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import {
  mockSponsor,
  mockContactPerson,
  mockBillingInfo,
} from '@/__mocks__/sponsor-data'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({
      sponsor: { crm: { list: { invalidate: vi.fn() } } },
    }),
  },
}))

function renderTable(sponsors: SponsorForConferenceExpanded[]) {
  return render(
    <NotificationProvider>
      <SponsorContactTable sponsors={sponsors} />
    </NotificationProvider>,
  )
}

/** The desktop table; the component also renders a mobile card list. */
function desktopTable() {
  return within(screen.getByRole('table'))
}

afterEach(cleanup)

describe('SponsorContactTable billing display', () => {
  it('shows the recorded invoice format', () => {
    renderTable([
      mockSponsor({ billing: mockBillingInfo({ invoiceFormat: 'ehf' }) }),
    ])

    expect(
      desktopTable().getByText('EHF (digital invoice)'),
    ).toBeInTheDocument()
  })

  it('flags a missing invoice format instead of claiming PDF', () => {
    renderTable([
      mockSponsor({
        billing: {
          ...mockBillingInfo(),
          invoiceFormat: undefined as unknown as 'pdf',
        },
      }),
    ])

    const table = desktopTable()
    expect(table.queryByText('PDF via email')).not.toBeInTheDocument()
    expect(table.getByText(/missing invoice format/i)).toBeInTheDocument()
  })

  it('flags an EHF sponsor that has no organisation number', () => {
    renderTable([
      mockSponsor({
        billing: mockBillingInfo({ invoiceFormat: 'ehf' }),
        sponsor: { ...mockSponsor().sponsor, orgNumber: undefined },
      }),
    ])

    expect(
      desktopTable().getByText(/missing organisation number/i),
    ).toBeInTheDocument()
  })

  it('says so when no billing details exist at all', () => {
    renderTable([mockSponsor({ billing: undefined })])

    expect(
      desktopTable().getByText('No billing information'),
    ).toBeInTheDocument()
  })

  it('does not repeat billing details on a sponsor’s further contact rows', () => {
    renderTable([
      mockSponsor({
        contactPersons: [
          mockContactPerson({ _key: 'a', name: 'Ada', isPrimary: true }),
          mockContactPerson({
            _key: 'b',
            name: 'Bo',
            email: 'bo@example.com',
          }),
        ],
      }),
    ])

    // One billing block for the sponsor, not one per contact row.
    expect(desktopTable().getAllByText('billing@example.com')).toHaveLength(1)
  })
})

describe('SponsorContactTable contact ordering', () => {
  it('lists the primary contact first even when stored last', () => {
    renderTable([
      mockSponsor({
        contactPersons: [
          mockContactPerson({
            _key: 'assistant',
            name: 'Assistant Person',
            email: 'assistant@example.com',
          }),
          mockContactPerson({
            _key: 'primary',
            name: 'Primary Person',
            email: 'primary@example.com',
            isPrimary: true,
          }),
        ],
      }),
    ])

    const rows = desktopTable().getAllByRole('row').slice(1) // drop the header
    expect(within(rows[0]).getByText('Primary Person')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Primary')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Assistant Person')).toBeInTheDocument()
  })
})

describe('SponsorContactTable empty state', () => {
  it('uses the caller’s description so filtered views explain themselves', () => {
    render(
      <NotificationProvider>
        <SponsorContactTable
          sponsors={[]}
          emptyDescription="No sponsors match the current filters."
        />
      </NotificationProvider>,
    )

    expect(
      screen.getByText('No sponsors match the current filters.'),
    ).toBeInTheDocument()
  })
})
