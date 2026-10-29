/**
 * @vitest-environment jsdom
 */
import { render, screen, cleanup, within } from '@testing-library/react'
import { mockSponsor } from '@/__mocks__/sponsor-data'
import { organizerWorklist } from '@/lib/sponsor-crm/action-items'
import { NeedsYouSection } from './SponsorOverview'

vi.mock('./SponsorActivityTimeline', () => ({
  SponsorActivityTimeline: () => null,
}))

afterEach(cleanup)

describe('NeedsYouSection', () => {
  const sponsors = Array.from({ length: 8 }, (_, i) =>
    mockSponsor({ _id: `sfc-${i}`, invoiceStatus: 'overdue' }),
  )

  it('lists one row per sponsor, at most five, and links counts to the board', () => {
    render(<NeedsYouSection items={organizerWorklist(sponsors, 'me')} />)
    const section = screen.getByRole('region', { name: 'Needs you' })
    const rows = within(section).getAllByRole('listitem')
    expect(rows).toHaveLength(5)
    // Each sponsor has overdue, no owner and stale: the most urgent leads.
    expect(rows[0]).toHaveTextContent('Invoice Overdue')
    expect(rows[0]).toHaveTextContent('+2 more')
    expect(rows[0]).toHaveTextContent('also: Assign an owner')
    expect(
      screen.getByRole('link', { name: '8 overdue invoices' }),
    ).toHaveAttribute(
      'href',
      '/admin/sponsors/crm?action=overdue&assignedTo=me-unassigned',
    )
    expect(screen.getByRole('link', { name: '8 no owner' })).toHaveAttribute(
      'href',
      '/admin/sponsors/crm?action=unassigned&assignedTo=me-unassigned',
    )
    expect(screen.getByRole('link', { name: /^See all \d+$/ })).toHaveAttribute(
      'href',
      '/admin/sponsors/crm?action=all&assignedTo=me-unassigned',
    )
  })

  it('leaves out sponsors another organizer owns', () => {
    const theirs = mockSponsor({
      _id: 'theirs',
      invoiceStatus: 'overdue',
      assignedTo: { _id: 'other', name: 'Other', email: 'o@x.no' },
    })
    render(<NeedsYouSection items={organizerWorklist([theirs], 'me')} />)
    expect(screen.getByText(/Nothing is waiting/)).toBeInTheDocument()
  })
})
