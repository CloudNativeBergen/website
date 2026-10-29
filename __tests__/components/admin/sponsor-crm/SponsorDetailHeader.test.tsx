/**
 * @vitest-environment jsdom
 *
 * The sponsor page header shows the status as a read-only badge. Stages
 * change on the board, through the phase card, or in the record panel.
 */
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@/lib/trpc/client', () => ({
  api: {
    sponsor: {
      crm: {
        getOverview: {
          useQuery: () => ({
            data: { status: 'negotiating', sponsor: { name: 'Acme' } },
            isLoading: false,
          }),
        },
      },
    },
  },
}))
vi.mock('@/components/SponsorLogo', () => ({ SponsorLogo: () => null }))

import { SponsorDetailHeader } from '@/components/admin/sponsor-crm/widgets/SponsorDetailHeader'

afterEach(cleanup)

it('shows the status as a badge, not a select', () => {
  render(<SponsorDetailHeader sponsorId="sfc-1" onOpenRecord={vi.fn()} />)
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.getByText('Negotiating')).toBeInTheDocument()
})
