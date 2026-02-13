import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ExpenseForm } from './ExpenseForm'
import { ExpenseCategory } from '@/lib/travel-support/types'

const meta = {
  title: 'Systems/Speakers/TravelSupport/ExpenseForm',
  component: ExpenseForm,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Form for adding or editing a travel expense. Supports category selection, amount, currency (with custom currency code for "Other"), date, location, description, and drag-and-drop receipt upload. Includes receipt processing consent and client-side validation.',
      },
    },
  },
} satisfies Meta<typeof ExpenseForm>

export default meta
type Story = StoryObj<typeof meta>

export const AddExpense: Story = {
  args: {
    onSave: fn(),
    onCancel: fn(),
  },
}

export const EditExpense: Story = {
  args: {
    onSave: fn(),
    onCancel: fn(),
    mode: 'edit',
    initialData: {
      category: ExpenseCategory.TRANSPORTATION,
      description: 'Flight from London to Bergen',
      amount: 250,
      currency: 'GBP',
      expenseDate: '2026-09-13',
      location: 'London → Bergen',
      receipts: [
        {
          file: {
            _type: 'file',
            asset: { _ref: 'file-abc123', _type: 'reference' },
          },
          filename: 'flight-booking.pdf',
          uploadedAt: '2026-08-01T10:00:00Z',
        },
      ],
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Edit mode pre-fills the form with existing expense data and shows current receipts.',
      },
    },
  },
}

export const Loading: Story = {
  args: {
    onSave: fn(),
    onCancel: fn(),
    isLoading: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Submit button is disabled and shows loading state.',
      },
    },
  },
}

export const WithError: Story = {
  args: {
    onSave: fn(),
    onCancel: fn(),
    error: 'Failed to upload receipt. Please try again.',
  },
}
