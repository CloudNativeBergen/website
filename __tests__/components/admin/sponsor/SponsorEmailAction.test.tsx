/**
 * @vitest-environment jsdom
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import type { Conference } from '@/lib/conference/types'

const h = vi.hoisted(() => ({ filters: [] as unknown[] }))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    sponsor: {
      crm: {
        broadcastRecipients: {
          useQuery: (filters: unknown) => {
            h.filters.push(filters)
            return {
              isLoading: false,
              data: {
                contactCount: 2,
                sponsorCount: 1,
                recipients: [
                  { email: 'kari@acme.test', name: 'Kari', sponsorName: 'Acme' },
                  { email: 'ola@acme.test', name: 'Ola', sponsorName: 'Acme' },
                ],
              },
            }
          },
        },
      },
      tiers: {
        listByConference: {
          useQuery: () => ({
            data: [{ _id: 'gold', title: 'Gold', tierType: 'standard' }],
          }),
        },
      },
    },
  },
}))
vi.mock('@/hooks/useSponsorBroadcast', async () => {
  const { useState } = await import('react')
  return {
    useSponsorBroadcast: () => {
      const [open, setOpen] = useState(false)
      return {
        isBroadcastModalOpen: open,
        setIsBroadcastModalOpen: setOpen,
        handleBroadcastEmail: vi.fn(),
        handleSyncContacts: vi.fn(),
      }
    },
  }
})
vi.mock('@/components/admin/GeneralBroadcastModal', () => ({
  GeneralBroadcastModal: (p: {
    isOpen: boolean
    title: string
    recipientInfo: React.ReactNode
  }) =>
    p.isOpen ? (
      <div role="dialog" aria-label={p.title}>
        {p.recipientInfo}
      </div>
    ) : null,
}))

import { SponsorEmailAction } from '@/components/admin/sponsor/SponsorEmailAction'

afterEach(cleanup)

const conference = {
  _id: 'conf',
  title: 'Conf',
  startDate: '2026-10-29',
} as unknown as Conference

describe('SponsorEmailAction', () => {
  it('shows the live count and preview, and sends filters only', () => {
    render(<SponsorEmailAction conference={conference} />)
    fireEvent.click(screen.getByRole('button', { name: 'Email sponsors' }))
    expect(screen.getByText('2 contacts at 1 sponsor')).toBeInTheDocument()
    expect(screen.getByText(/kari@acme\.test/)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Gold'))
    fireEvent.click(screen.getByLabelText('Billing contacts'))
    expect(h.filters.at(-1)).toEqual({
      tierIds: ['gold'],
      statuses: ['closed-won'],
      contactRole: 'billing',
    })
  })

  it('keeps at least one stage selected', () => {
    render(<SponsorEmailAction conference={conference} />)
    fireEvent.click(screen.getByRole('button', { name: 'Email sponsors' }))
    fireEvent.click(screen.getByLabelText('Won'))
    expect(screen.getByLabelText('Won')).toBeChecked()
  })
})
