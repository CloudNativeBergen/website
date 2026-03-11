/**
 * @vitest-environment jsdom
 */
import { deduplicateTicketsByEmail } from '@/lib/tickets/utils'
import type { EventTicket } from '@/lib/tickets/types'

describe('deduplicateTicketsByEmail', () => {
  const createMockTicket = (
    id: number,
    email: string,
    sum: string,
    orderDate: string,
  ): EventTicket => ({
    id,
    order_id: id,
    order_date: orderDate,
    category: 'Standard',
    customer_name: 'Test User',
    sum,
    sum_left: '0',
    fields: [],
    crm: {
      first_name: 'Test',
      last_name: 'User',
      email,
    },
  })

  it('should keep all tickets when there are no duplicates', () => {
    const tickets = [
      createMockTicket(1, 'user1@example.com', '1000', '2024-01-01'),
      createMockTicket(2, 'user2@example.com', '1000', '2024-01-02'),
      createMockTicket(3, 'user3@example.com', '1000', '2024-01-03'),
    ]

    const result = deduplicateTicketsByEmail(tickets)
    expect(result).toHaveLength(3)
  })

  it('should remove duplicate emails, keeping the higher value ticket', () => {
    const tickets = [
      createMockTicket(1, 'user@example.com', '1000', '2024-01-01'),
      createMockTicket(2, 'user@example.com', '2000', '2024-01-02'),
    ]

    const result = deduplicateTicketsByEmail(tickets)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(2)
    expect(result[0].sum).toBe('2000')
  })

  it('should handle case-insensitive email matching', () => {
    const tickets = [
      createMockTicket(1, 'User@Example.com', '1000', '2024-01-01'),
      createMockTicket(2, 'user@example.com', '2000', '2024-01-02'),
    ]

    const result = deduplicateTicketsByEmail(tickets)
    expect(result).toHaveLength(1)
    expect(result[0].sum).toBe('2000')
  })

  it('should keep most recent ticket when amounts are equal', () => {
    const tickets = [
      createMockTicket(1, 'user@example.com', '1000', '2024-01-01'),
      createMockTicket(2, 'user@example.com', '1000', '2024-01-03'),
    ]

    const result = deduplicateTicketsByEmail(tickets)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(2)
    expect(result[0].order_date).toBe('2024-01-03')
  })

  it('should handle tickets with no email separately', () => {
    const tickets = [
      createMockTicket(1, 'user@example.com', '1000', '2024-01-01'),
      {
        ...createMockTicket(2, '', '1000', '2024-01-02'),
        crm: {
          first_name: 'Test',
          last_name: 'User',
          email: '',
        },
      },
      {
        ...createMockTicket(3, '', '1000', '2024-01-03'),
        crm: {
          first_name: 'Test',
          last_name: 'User',
          email: '',
        },
      },
    ]

    const result = deduplicateTicketsByEmail(tickets)
    expect(result).toHaveLength(3)
  })

  it('should handle multiple duplicates correctly', () => {
    const tickets = [
      createMockTicket(1, 'user1@example.com', '1000', '2024-01-01'),
      createMockTicket(2, 'user1@example.com', '1500', '2024-01-02'),
      createMockTicket(3, 'user2@example.com', '2000', '2024-01-03'),
      createMockTicket(4, 'user2@example.com', '2500', '2024-01-04'),
      createMockTicket(5, 'user3@example.com', '3000', '2024-01-05'),
    ]

    const result = deduplicateTicketsByEmail(tickets)
    expect(result).toHaveLength(3)
    expect(result.find((t) => t.crm.email === 'user1@example.com')?.sum).toBe(
      '1500',
    )
    expect(result.find((t) => t.crm.email === 'user2@example.com')?.sum).toBe(
      '2500',
    )
    expect(result.find((t) => t.crm.email === 'user3@example.com')?.sum).toBe(
      '3000',
    )
  })

  it('should handle upgrade scenario (one-day to two-day ticket)', () => {
    const tickets = [
      createMockTicket(1, 'attendee@example.com', '800', '2024-01-01'),
      createMockTicket(2, 'attendee@example.com', '1400', '2024-01-15'),
    ]

    const result = deduplicateTicketsByEmail(tickets)
    expect(result).toHaveLength(1)
    expect(result[0].sum).toBe('1400')
    expect(result[0].order_date).toBe('2024-01-15')
  })
})
