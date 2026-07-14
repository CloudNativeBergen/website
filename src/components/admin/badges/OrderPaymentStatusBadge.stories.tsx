import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  OrderPaymentStatusBadge,
  type OrderPaymentStatus,
} from './OrderPaymentStatusBadge'

const meta: Meta<typeof OrderPaymentStatusBadge> = {
  title: 'Systems/Tickets/OrderPaymentStatusBadge',
  component: OrderPaymentStatusBadge,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Domain adapter that maps an order/invoice payment state (paid/due/overdue) to the shared `StatusBadge`, keeping the colour ladder in one place.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof OrderPaymentStatusBadge>

export const Paid: Story = { args: { status: 'paid' } }
export const Due: Story = { args: { status: 'due' } }
export const Overdue: Story = { args: { status: 'overdue' } }

const ALL_STATUSES: OrderPaymentStatus[] = ['paid', 'due', 'overdue']

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {ALL_STATUSES.map((status) => (
        <OrderPaymentStatusBadge key={status} status={status} />
      ))}
    </div>
  ),
}
