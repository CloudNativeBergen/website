/**
 * @vitest-environment jsdom
 *
 * Inline invoice actions: the next state-machine step per status, the due
 * date sent with "Mark sent", a server refusal shown on the row, and the CRM
 * queries refreshed after a change.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const mutateAsync = vi.fn()
const invalidate = vi.fn()

vi.mock('@/lib/trpc/client', () => ({
  api: {
    useUtils: () => ({ sponsor: { crm: { invalidate } } }),
    sponsor: {
      crm: {
        update: {
          useMutation: () => ({ mutateAsync, isPending: false }),
        },
      },
    },
  },
}))

import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import { SponsorInvoiceTable } from '@/components/admin/sponsor/SponsorInvoiceTable'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import {
  defaultInvoiceDueDate,
  type InvoiceRow,
} from '@/lib/sponsor-crm/invoice'
import type { InvoiceStatus } from '@/lib/sponsor-crm/types'

function row(invoiceStatus: InvoiceStatus): InvoiceRow {
  return {
    sponsorForConferenceId: 'sfc-1',
    sponsorName: 'Acme',
    amount: 1000,
    currency: 'NOK',
    amountFromTier: false,
    addonTitles: [],
    invoiceFormat: null,
    invoiceStatus,
    readiness: { ready: true, blockers: [] },
  }
}

function renderTable(status: InvoiceStatus) {
  render(
    <NotificationProvider>
      <SponsorInvoiceTable rows={[row(status)]} />
    </NotificationProvider>,
  )
}

// The table renders a mobile card and a desktop row; use the first match.
const button = (name: string) => screen.getAllByRole('button', { name })[0]
const names = () =>
  screen
    .queryAllByRole('button')
    .map((b) => b.getAttribute('aria-label'))
    .filter((n): n is string => !!n && n.startsWith('Mark'))

beforeEach(() => {
  mutateAsync.mockReset().mockResolvedValue({})
  invalidate.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('SponsorInvoiceTable inline actions', () => {
  it.each([
    ['not-sent', ['Mark Acme invoice sent']],
    ['sent', ['Mark Acme invoice paid', 'Mark Acme invoice overdue']],
    ['overdue', ['Mark Acme invoice paid']],
    ['paid', []],
    ['cancelled', []],
  ] as const)('offers the next step for %s', (status, expected) => {
    renderTable(status)
    expect([...new Set(names())]).toEqual(expected)
  })

  it('marks sent with the default due date', async () => {
    renderTable('not-sent')
    fireEvent.click(button('Mark Acme invoice sent'))
    const input = screen.getAllByLabelText(
      'Due date for Acme invoice',
    )[0] as HTMLInputElement
    expect(input.value).toBe(defaultInvoiceDueDate())
    fireEvent.click(button('Confirm Acme invoice sent'))
    await waitFor(() => expect(invalidate).toHaveBeenCalled())
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 'sfc-1',
      invoiceStatus: 'sent',
      invoiceDueAt: defaultInvoiceDueDate(),
    })
  })

  it('passes an overridden due date through', async () => {
    renderTable('not-sent')
    fireEvent.click(button('Mark Acme invoice sent'))
    fireEvent.change(screen.getAllByLabelText('Due date for Acme invoice')[0], {
      target: { value: '2027-01-15' },
    })
    fireEvent.click(button('Confirm Acme invoice sent'))
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        id: 'sfc-1',
        invoiceStatus: 'sent',
        invoiceDueAt: '2027-01-15',
      }),
    )
  })

  it('marks paid and refreshes the CRM queries', async () => {
    renderTable('sent')
    fireEvent.click(button('Mark Acme invoice paid'))
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 'sfc-1',
      invoiceStatus: 'paid',
    })
  })

  it('shows the server refusal on the row and returns focus', async () => {
    mutateAsync.mockRejectedValue(
      new Error(
        'Add a billing email address before marking the invoice as sent.',
      ),
    )
    renderTable('not-sent')
    fireEvent.click(button('Mark Acme invoice sent'))
    const confirm = button('Confirm Acme invoice sent')
    fireEvent.click(confirm)
    const alerts = await screen.findAllByText(
      'Add a billing email address before marking the invoice as sent.',
    )
    expect(alerts.length).toBeGreaterThan(0)
    expect(document.activeElement).toBe(confirm)
    expect(invalidate).not.toHaveBeenCalled()
  })
})
