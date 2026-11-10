import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const k = vi.hoisted(() => ({
  jwt: null as string | null,
  mutate: vi.fn(),
}))
vi.mock('@/lib/konf-api/conference-write', () => ({
  identityJwt: async () => k.jwt,
  requestHost: async () => 'conf.example',
  mutate: k.mutate,
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
    k.jwt = null
    k.mutate.mockReset()
    const { mutate } = await import('@/lib/konf-api/conference-write')
    await expect(new KonfProvider().fetchEventTickets()).rejects.toThrow(
      'signed-in organizer',
    )
    expect(mutate).not.toHaveBeenCalled()
  })
})

describe('KonfProvider reads (#2238 review)', () => {
  it('throws when the gateway refuses the order read (null), never "0 sold"', async () => {
    k.jwt = 'jwt'
    k.mutate.mockResolvedValueOnce({ ticketOrders: null })
    await expect(new KonfProvider().fetchEventTickets()).rejects.toThrow(
      'refused',
    )
  })

  it('throws when the gateway refuses the sales read (null)', async () => {
    k.jwt = 'jwt'
    k.mutate.mockResolvedValueOnce({ ticketSales: null })
    const ref = { provider: 'konf' as const, accountId: 'o', externalId: 'n' }
    await expect(
      new KonfProvider().fetchPublicTicketTypes(ref),
    ).rejects.toThrow('refused')
  })

  it('claims no VAT rate on native ticket types', async () => {
    k.jwt = 'jwt'
    k.mutate.mockResolvedValueOnce({
      ticketSales: {
        byType: [
          {
            id: 't',
            name: 'Regular',
            capacity: 10,
            sold: 3,
            price: money(100),
          },
        ],
      },
    })
    const ref = { provider: 'konf' as const, accountId: 'o', externalId: 'n' }
    const { tickets } = await new KonfProvider().fetchPublicTicketTypes(ref)
    expect(tickets[0].price[0].vat).toBe('')
    expect(tickets[0].available).toBe(7)
  })
})
