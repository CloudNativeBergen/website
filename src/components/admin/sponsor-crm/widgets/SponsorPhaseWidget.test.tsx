/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { SponsorPhaseWidget } from './SponsorPhaseWidget'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

vi.mock('@/lib/trpc/client', () => ({
  api: {
    sponsor: {
      crm: {
        moveStage: { useMutation: () => ({ mutate: vi.fn() }) },
        update: { useMutation: () => ({ mutate: vi.fn() }) },
      },
    },
  },
}))
vi.mock('@/components/admin/NotificationProvider', () => ({
  useNotification: () => ({ showNotification: vi.fn() }),
}))

it('shows no date text on a reached step without a date, pending on the rest', () => {
  render(
    <SponsorPhaseWidget
      sponsor={
        {
          _id: 's1',
          sponsor: { name: 'Acme' },
          status: 'contacted',
          contractStatus: 'none',
          invoiceStatus: 'not-sent',
        } as unknown as SponsorForConferenceExpanded
      }
      onOpenRecord={vi.fn()}
      onChanged={vi.fn()}
    />,
  )
  expect(screen.queryByText('date unknown')).toBeNull()
  const contacted = screen
    .getAllByText('Contacted')
    .map((el) => el.closest('li'))
    .find(Boolean)!
  expect(contacted.textContent).toBe('Contacted')
  expect(screen.getAllByText('pending').length).toBeGreaterThan(0)
})
