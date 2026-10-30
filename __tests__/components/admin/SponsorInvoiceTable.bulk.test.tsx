/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { TAP_GUARD_MS } from '@/hooks/useOpenedLongEnough'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type { InvoiceRow } from '@/lib/sponsor-crm/invoice'
import type { InvoiceStatus } from '@/lib/sponsor-crm/types'
import { SponsorInvoiceTable } from '@/components/admin/sponsor/SponsorInvoiceTable'

const h = vi.hoisted(() => ({
  bulk: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({ sponsor: { crm: { invalidate: h.invalidate } } }),
    sponsor: {
      crm: {
        update: { useMutation: () => ({ isPending: false }) },
        bulkSetInvoiceStatus: {
          useMutation: () => ({ mutateAsync: h.bulk, isPending: false }),
        },
      },
    },
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const row = (
  id: string,
  name: string,
  invoiceStatus: InvoiceStatus,
): InvoiceRow => ({
  sponsorForConferenceId: id,
  sponsorName: name,
  amount: 1000,
  currency: 'NOK',
  amountFromTier: false,
  addonTitles: [],
  invoiceFormat: 'EHF',
  invoiceStatus,
  readiness: { ready: true, blockers: [] },
})

// Mixed states, as "select all" sees them in the default view.
const rows = [
  row('a', 'Acme', 'sent'),
  row('b', 'Globex', 'paid'),
  row('c', 'Initech', 'overdue'),
  row('d', 'Umbrella', 'not-sent'),
]

describe('SponsorInvoiceTable bulk status', () => {
  it('marks the selected invoices paid after confirming and reports failures', async () => {
    h.bulk.mockResolvedValue([
      { id: 'a', ok: true },
      { id: 'c', ok: false, error: 'Billing email missing' },
    ])
    render(
      <NotificationProvider>
        <SponsorInvoiceTable rows={rows} />
      </NotificationProvider>,
    )

    // Mobile cards and the desktop table both render in jsdom.
    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Select Acme invoice' })[0],
    )
    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Select Globex invoice' })[0],
    )
    fireEvent.click(
      screen.getAllByRole('checkbox', { name: 'Select Initech invoice' })[1],
    )
    expect(screen.getByText('3 selected')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mark paid' }))
    expect(h.bulk).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    // The confirm button ignores a double tap's second tap for a moment.
    await act(() => new Promise((r) => setTimeout(r, TAP_GUARD_MS + 50)))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark paid' }))

    await waitFor(() =>
      expect(h.bulk).toHaveBeenCalledWith({
        ids: ['a', 'c'],
        invoiceStatus: 'paid',
      }),
    )
    expect(
      await screen.findByText('1 marked paid, 1 failed'),
    ).toBeInTheDocument()
    // The server's reason per sponsor, and the paid row skipped, not counted.
    expect(
      screen.getByText(/Initech: Billing email missing\..*1 skipped/),
    ).toBeInTheDocument()
    expect(h.invalidate).toHaveBeenCalled()
    // The failed row stays selected for another try.
    await waitFor(() =>
      expect(screen.getByText('1 selected')).toBeInTheDocument(),
    )
  })

  it('select all marks only not-sent invoices sent, without a dialog', async () => {
    h.bulk.mockResolvedValue([{ id: 'd', ok: true }])
    render(
      <NotificationProvider>
        <SponsorInvoiceTable rows={rows} />
      </NotificationProvider>,
    )
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select all shown invoices' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Mark sent' }))
    await waitFor(() =>
      expect(h.bulk).toHaveBeenCalledWith({
        ids: ['d'],
        invoiceStatus: 'sent',
      }),
    )
    expect(await screen.findByText('1 marked sent')).toBeInTheDocument()
    expect(screen.getByText(/3 skipped/)).toBeInTheDocument()
  })
})
