import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { BankingDetailsDisplay } from './BankingDetailsDisplay'
import type { BankingDetails } from '@/lib/travel-support/types'

const meta = {
  title: 'Systems/Speakers/TravelSupport/BankingDetailsDisplay',
  component: BankingDetailsDisplay,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Displays saved banking details for travel reimbursements (beneficiary name, IBAN, SWIFT/BIC, etc.). Shows an empty state with an "Add Banking Details" button when no data is provided.',
      },
    },
  },
} satisfies Meta<typeof BankingDetailsDisplay>

export default meta
type Story = StoryObj<typeof meta>

const fullDetails: BankingDetails = {
  beneficiaryName: 'Jane Doe',
  bankName: 'DNB Bank ASA',
  iban: 'NO93 8601 1117 947',
  accountNumber: '8601 11 17947',
  swiftCode: 'DNBANOKK',
  country: 'Norway',
  preferredCurrency: 'NOK',
}

export const WithAllDetails: Story = {
  args: {
    bankingDetails: fullDetails,
  },
}

export const MinimalDetails: Story = {
  args: {
    bankingDetails: {
      beneficiaryName: 'John Smith',
      bankName: 'Barclays',
      swiftCode: 'BARCGB22',
      country: 'United Kingdom',
      preferredCurrency: 'GBP',
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Only required fields are filled — IBAN and account number are omitted.',
      },
    },
  },
}

export const Editable: Story = {
  args: {
    bankingDetails: fullDetails,
    canEdit: true,
    onEdit: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'When `canEdit` is true, an Edit button appears in the top-right corner.',
      },
    },
  },
}

export const EmptyState: Story = {
  args: {
    bankingDetails: {
      beneficiaryName: '',
      bankName: '',
      swiftCode: '',
      country: '',
      preferredCurrency: 'NOK',
    },
  },
  parameters: {
    docs: {
      description: {
        story: 'No details saved — shows a prompt to add banking information.',
      },
    },
  },
}

export const EmptyStateEditable: Story = {
  args: {
    bankingDetails: {
      beneficiaryName: '',
      bankName: '',
      swiftCode: '',
      country: '',
      preferredCurrency: 'NOK',
    },
    canEdit: true,
    onEdit: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Empty state with the "Add Banking Details" button visible.',
      },
    },
  },
}
