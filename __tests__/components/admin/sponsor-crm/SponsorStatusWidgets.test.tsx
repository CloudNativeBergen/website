/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'

const data = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))

vi.mock('@/lib/trpc/client', () => {
  const useQuery = () => ({
    data: data.current,
    isLoading: false,
    error: null,
  })
  return {
    api: {
      sponsor: {
        crm: {
          getContractDetails: { useQuery },
          getOverview: { useQuery },
        },
      },
    },
  }
})

import { SponsorContractWidget } from '@/components/admin/sponsor-crm/widgets/SponsorContractWidget'
import { SponsorOverviewWidget } from '@/components/admin/sponsor-crm/widgets/SponsorOverviewWidget'

describe('sponsor status widgets use the board labels', () => {
  it('contract widget: No Contract and Awaiting signature', () => {
    data.current = { contractStatus: 'none', signatureStatus: 'pending' }
    render(<SponsorContractWidget sponsorId="s1" onEdit={() => {}} />)
    expect(screen.getByText('No Contract')).toBeInTheDocument()
    expect(screen.getByText('Awaiting signature')).toBeInTheDocument()
  })

  it('overview widget: Won, not "closed won"', () => {
    data.current = { status: 'closed-won' }
    render(<SponsorOverviewWidget sponsorId="s1" onEdit={() => {}} />)
    expect(screen.getByText('Won')).toBeInTheDocument()
  })
})
