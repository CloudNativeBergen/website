import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/konf-api/conference-write', () => ({
  identityJwt: async () => null,
  requestHost: async () => 'conf.example',
  mutate: vi.fn(),
}))

const { KonfProvider, ticketsFromOrders } = await import('./konf')

const money = (amountMinor: number) => ({ amountMinor, currency: 'NOK' })

describe('ticketsFromOrders (#2238)', () => {
  it('mints one row per seat, drops cancelled orders, keeps a null buyer name', () => {
    const rows = ticketsFromOrders([
      {
        id: 'o1',
        createdAt: '2026-10-01T10:00:00Z',
        status: 'paid',
        buyerName: 'Ada Lovelace King',
        buyerEmail: 'ada@example.com',
        lines: [
          {
            ticketTypeId: 't1',
            ticketTypeName: 'Regular',
            quantity: 2,
            unitPrice: money(150000),
          },
          {
            ticketTypeId: 't2',
            ticketTypeName: 'Workshop',
            quantity: 1,
            unitPrice: money(50000),
          },
        ],
      },
      {
        id: 'o2',
        createdAt: '2026-10-02T10:00:00Z',
        status: 'pending',
        buyerName: null,
        buyerEmail: null,
        lines: [
          {
            ticketTypeId: 't1',
            ticketTypeName: 'Regular',
            quantity: 1,
            unitPrice: money(150000),
          },
        ],
      },
      {
        id: 'o3',
        createdAt: '2026-10-03T10:00:00Z',
        status: 'cancelled',
        buyerName: 'Gone',
        buyerEmail: 'x@example.com',
        lines: [
          {
            ticketTypeId: 't1',
            ticketTypeName: 'Regular',
            quantity: 5,
            unitPrice: money(150000),
          },
        ],
      },
    ])
    expect(
      rows.map((r) => [
        r.order_id,
        r.category,
        r.sum.amountMinor,
        r.sum_left.amountMinor,
      ]),
    ).toEqual([
      ['o1', 'Regular', 150000, 0],
      ['o1', 'Regular', 150000, 0],
      ['o1', 'Workshop', 50000, 0],
      ['o2', 'Regular', 150000, 150000],
    ])
    expect(new Set(rows.map((r) => r.id)).size).toBe(4)
    expect(rows[0].crm).toEqual({
      first_name: 'Ada',
      last_name: 'Lovelace King',
      email: 'ada@example.com',
    })
    expect(rows[3].customer_name).toBeNull()
    expect(rows[3].crm).toEqual({ first_name: '', last_name: '', email: '' })
    expect(rows[3].order).toEqual({
      createdAt: '2026-10-02T10:00:00Z',
      paymentStatus: 'pending',
      paid: false,
    })
  })
})

describe('KonfProvider', () => {
  it('refuses to read without a signed-in organizer, before any request', async () => {
    const { mutate } = await import('@/lib/konf-api/conference-write')
    await expect(new KonfProvider().fetchEventTickets()).rejects.toThrow(
      'signed-in organizer',
    )
    expect(mutate).not.toHaveBeenCalled()
  })
})
