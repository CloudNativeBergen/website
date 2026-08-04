import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { OrdersTableWithSearch } from './OrdersTableWithSearch'
import type { EventTicket, GroupedOrder } from '@/lib/tickets/types'

// The row actions are the point of this story: alongside the payment modal
// there is now a link into the visa-letter form, carrying that ticket holder's
// details. Expand the two-seat order to see the per-attendee links — one order
// can hold several people, and each needs their own letter.

const ticket = (
  overrides: Partial<EventTicket> & { id: number; order_id: number },
): EventTicket => ({
  category: 'Conference (1 Day)',
  customer_name: null,
  sum: '4500',
  sum_left: '0',
  order_date: '2026-07-14T10:00:00Z',
  fields: [],
  crm: { first_name: 'Amina', last_name: 'Yusuf', email: 'amina@example.com' },
  ...overrides,
})

const orders: GroupedOrder[] = [
  {
    order_id: 88912,
    order_date: '2026-07-14T10:00:00Z',
    totalTickets: 1,
    totalAmount: 4500,
    amountLeft: 0,
    categories: ['Conference (1 Day)'],
    fields: [
      { key: 'company', value: 'Example Bank Ltd' },
      { key: 'work_title', value: 'Software Engineer' },
    ],
    tickets: [
      ticket({
        id: 1,
        order_id: 88912,
        fields: [
          { key: 'company', value: 'Example Bank Ltd' },
          { key: 'work_title', value: 'Software Engineer' },
        ],
      }),
    ],
  },
  {
    order_id: 88913,
    order_date: '2026-07-02T08:30:00Z',
    totalTickets: 2,
    totalAmount: 12000,
    amountLeft: 12000,
    categories: ['Workshop + Conference (2 Days)'],
    fields: [{ key: 'company', value: 'Example GmbH' }],
    tickets: [
      ticket({
        id: 2,
        order_id: 88913,
        category: 'Workshop + Conference (2 Days)',
        customer_name: 'Chen Wei',
        sum: '6000',
        sum_left: '6000',
        crm: {
          first_name: 'Chen',
          last_name: 'Wei',
          email: 'chen@example.com',
        },
        fields: [{ key: 'company', value: 'Example GmbH' }],
      }),
      ticket({
        id: 3,
        order_id: 88913,
        category: 'Workshop + Conference (2 Days)',
        customer_name: 'Priya Nair',
        sum: '6000',
        sum_left: '6000',
        crm: {
          first_name: 'Priya',
          last_name: 'Nair',
          email: 'priya@example.com',
        },
        fields: [{ key: 'company', value: 'Example GmbH' }],
      }),
    ],
  },
]

const FIXED_NOW = new Date('2026-03-01T12:00:00Z').getTime()

const meta = {
  beforeEach: () => {
    // Pin the clock (house pattern — see Countdown.stories): the table derives
    // payment status from `new Date()`, so an unpinned clock makes an overdue
    // row flip to on-time as the fixture ages and drifts Chromatic snapshots.
    const OriginalDate = globalThis.Date
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockDate: any = function (...args: any[]) {
      if (args.length === 0) return new OriginalDate(FIXED_NOW)
      return new (
        Function.prototype.bind.apply(OriginalDate, [
          null,
          ...args,
        ]) as typeof OriginalDate
      )()
    }
    Object.setPrototypeOf(MockDate, OriginalDate)
    MockDate.prototype = Object.create(OriginalDate.prototype)
    MockDate.now = () => FIXED_NOW
    MockDate.parse = OriginalDate.parse.bind(OriginalDate)
    MockDate.UTC = OriginalDate.UTC.bind(OriginalDate)
    globalThis.Date = MockDate
    return () => {
      globalThis.Date = OriginalDate
    }
  },

  title: 'Systems/Participants/Admin/OrdersTable',
  component: OrdersTableWithSearch,
  parameters: { layout: 'fullscreen', options: { showPanel: false } },
  args: { orders, customerId: 1234, eventId: 5678 },
} satisfies Meta<typeof OrdersTableWithSearch>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const NoOrders: Story = { args: { orders: [] } }
