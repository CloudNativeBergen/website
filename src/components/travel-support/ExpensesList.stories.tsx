import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ExpensesList } from './ExpensesList'
import type { TravelExpense } from '@/lib/travel-support/types'
import { ExpenseCategory, ExpenseStatus } from '@/lib/travel-support/types'

const meta = {
  title: 'Systems/Speakers/TravelSupport/ExpensesList',
  component: ExpensesList,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Renders a list of travel expense items with status badges, category labels, amounts, receipt links, and inline editing. Supports edit/delete actions for pending expenses when `canEdit` is true.',
      },
    },
  },
} satisfies Meta<typeof ExpensesList>

export default meta
type Story = StoryObj<typeof meta>

const baseExpense = {
  _rev: 'rev1',
  _createdAt: '2026-01-10T10:00:00Z',
  _updatedAt: '2026-01-10T10:00:00Z',
  travelSupport: { _ref: 'ts-1', _type: 'reference' as const },
  currency: 'NOK' as const,
  receipts: [
    {
      file: {
        _type: 'file' as const,
        asset: { _ref: 'file-1', _type: 'reference' as const },
      },
      filename: 'receipt.jpg',
      uploadedAt: '2026-01-10T10:00:00Z',
      url: 'https://placehold.co/400x300/e2e8f0/475569?text=Receipt',
    },
  ],
}

const mockExpenses: TravelExpense[] = [
  {
    ...baseExpense,
    _id: 'exp-1',
    category: ExpenseCategory.ACCOMMODATION,
    description: 'Hotel Scandic Bergen City - 2 nights',
    amount: 3200,
    expenseDate: '2026-09-14',
    location: 'Bergen, Norway',
    status: ExpenseStatus.APPROVED,
    reviewNotes: 'Approved within budget guidelines.',
  },
  {
    ...baseExpense,
    _id: 'exp-2',
    category: ExpenseCategory.TRANSPORTATION,
    description: 'Flight London Heathrow → Bergen Flesland',
    amount: 1850,
    currency: 'GBP',
    expenseDate: '2026-09-13',
    location: 'London → Bergen',
    status: ExpenseStatus.PENDING,
    receipts: [
      {
        ...baseExpense.receipts[0],
        filename: 'flight-booking.pdf',
      },
      {
        ...baseExpense.receipts[0],
        filename: 'boarding-pass.pdf',
      },
    ],
  },
  {
    ...baseExpense,
    _id: 'exp-3',
    category: ExpenseCategory.MEALS,
    description: 'Conference dinner',
    amount: 450,
    expenseDate: '2026-09-15',
    location: 'Bergen, Norway',
    status: ExpenseStatus.REJECTED,
    reviewNotes: 'Conference dinner is already covered by the organizer.',
  },
  {
    ...baseExpense,
    _id: 'exp-4',
    category: ExpenseCategory.VISA,
    description: 'Schengen visa fee',
    amount: 80,
    currency: 'EUR',
    expenseDate: '2026-08-01',
    status: ExpenseStatus.PENDING,
  },
]

export const Default: Story = {
  args: {
    expenses: mockExpenses,
  },
}

export const Editable: Story = {
  args: {
    expenses: mockExpenses,
    canEdit: true,
    onEdit: fn(),
    onDelete: fn(),
    onDeleteReceipt: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Pending expenses show Edit and Delete buttons. Approved/rejected expenses cannot be modified.',
      },
    },
  },
}

export const EmptyState: Story = {
  args: {
    expenses: [],
  },
}

export const AllApproved: Story = {
  args: {
    expenses: mockExpenses
      .slice(0, 2)
      .map((e) => ({ ...e, status: ExpenseStatus.APPROVED })),
  },
}
