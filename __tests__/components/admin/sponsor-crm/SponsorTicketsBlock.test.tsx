/**
 * @vitest-environment jsdom
 *
 * The sponsor panel's Tickets block (#1704 T1): the stored codes against the
 * tier's entitlement, and Link / Unlink on the existing sponsor.crm
 * procedures, each refreshing the record.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import { mockSponsor } from '@/__mocks__/sponsor-data'

const q = vi.hoisted(() => ({
  assign: vi.fn(),
  unassign: vi.fn(),
  invalidateRecord: vi.fn(),
  invalidateOptions: vi.fn(),
}))

vi.mock('@/lib/trpc/client', () => {
  // Calls onSuccess like the real hook, so the refresh is exercised.
  const mutation =
    (fn: (input: unknown) => unknown) =>
    (opts: { onSuccess?: () => void }) => ({
      mutate: (input: unknown) => {
        fn(input)
        opts.onSuccess?.()
      },
      isPending: false,
    })
  return {
    api: {
      useUtils: () => ({
        sponsor: {
          crm: {
            getById: { invalidate: q.invalidateRecord },
            discountCodeOptions: { invalidate: q.invalidateOptions },
            activities: { list: { invalidate: vi.fn() } },
          },
        },
      }),
      sponsor: {
        crm: {
          discountCodeOptions: {
            useQuery: () => ({
              isLoading: false,
              error: null,
              data: {
                codes: [
                  {
                    code: 'ACME-2026',
                    linked: true,
                    selected: true,
                    used: 2,
                    limit: 5,
                    type: 'percent',
                    value: '100',
                  },
                  { code: 'FREE-1', linked: false, selected: false },
                  {
                    code: 'GLOBEX-VIP',
                    linked: false,
                    selected: false,
                    linkedTo: 'Globex',
                  },
                ],
              },
            }),
          },
          assignDiscountCodes: { useMutation: mutation(q.assign) },
          unassignDiscountCode: { useMutation: mutation(q.unassign) },
        },
      },
    },
  }
})

import { SponsorTicketsBlock } from '@/components/admin/sponsor-crm/SponsorTicketsBlock'
import { NotificationProvider } from '@/components/admin/NotificationProvider'

function renderBlock() {
  const sponsor = mockSponsor({
    discountCodes: [{ _key: 'k1', code: 'ACME-2026' }],
  })
  sponsor.tier = { ...sponsor.tier!, ticketEntitlement: 4 }
  render(
    <NotificationProvider>
      <SponsorTicketsBlock sponsor={sponsor} />
    </NotificationProvider>,
  )
  return sponsor
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('SponsorTicketsBlock', () => {
  it('lists the linked codes with usage, and the entitlement', () => {
    renderBlock()
    expect(screen.getByText('ACME-2026')).toBeInTheDocument()
    expect(screen.getByText(/used 2 \/ 5/)).toBeInTheDocument()
    expect(
      screen.getByText(/1 code linked · the tier includes 4 tickets/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Copy discount code ACME-2026' }),
    ).toBeInTheDocument()
  })

  it('offers only codes nobody holds, and links one then refreshes', () => {
    const sponsor = renderBlock()
    const select = screen.getByLabelText('Code to link')
    const offered = Array.from(select.querySelectorAll('option')).map(
      (o) => o.value,
    )
    expect(offered).toEqual(['', 'FREE-1'])
    fireEvent.change(select, { target: { value: 'FREE-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link a code' }))
    expect(q.assign).toHaveBeenCalledWith({
      sponsorForConferenceId: sponsor._id,
      discountCodes: ['FREE-1'],
    })
    expect(q.invalidateRecord).toHaveBeenCalledWith({ id: sponsor._id })
    expect(q.invalidateOptions).toHaveBeenCalled()
  })

  it('unlinks only after a confirm, then refreshes', async () => {
    const sponsor = renderBlock()
    fireEvent.click(screen.getByRole('button', { name: 'Unlink' }))
    expect(q.unassign).not.toHaveBeenCalled()
    const confirm = await screen.findAllByRole('button', { name: 'Unlink' })
    fireEvent.click(confirm[confirm.length - 1])
    await waitFor(() =>
      expect(q.unassign).toHaveBeenCalledWith({
        sponsorForConferenceId: sponsor._id,
        code: 'ACME-2026',
      }),
    )
    expect(q.invalidateRecord).toHaveBeenCalledWith({ id: sponsor._id })
  })
})
