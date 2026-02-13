import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { BankingDetailsForm } from './BankingDetailsForm'

const meta = {
  title: 'Systems/Speakers/TravelSupport/BankingDetailsForm',
  component: BankingDetailsForm,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Form for entering banking details for travel reimbursements. Includes validation for required fields (beneficiary name, bank name, SWIFT/BIC, country, and either IBAN or account number), a financial data processing consent checkbox, and currency selection.',
      },
    },
  },
} satisfies Meta<typeof BankingDetailsForm>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    onSave: fn(),
  },
}

export const WithInitialData: Story = {
  args: {
    initialData: {
      beneficiaryName: 'Jane Doe',
      bankName: 'DNB Bank ASA',
      iban: 'NO93 8601 1117 947',
      accountNumber: '',
      swiftCode: 'DNBANOKK',
      country: 'Norway',
      preferredCurrency: 'NOK',
    },
    onSave: fn(),
  },
}

export const Loading: Story = {
  args: {
    initialData: {
      beneficiaryName: 'Jane Doe',
      bankName: 'DNB Bank ASA',
      iban: 'NO93 8601 1117 947',
      accountNumber: '',
      swiftCode: 'DNBANOKK',
      country: 'Norway',
      preferredCurrency: 'NOK',
    },
    onSave: fn(),
    isLoading: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Submit button shows "Saving..." and is disabled while loading.',
      },
    },
  },
}

export const WithError: Story = {
  args: {
    onSave: fn(),
    error: 'Failed to save banking details. Please try again.',
  },
  parameters: {
    docs: {
      description: {
        story: 'Server error displayed above the form fields.',
      },
    },
  },
}
