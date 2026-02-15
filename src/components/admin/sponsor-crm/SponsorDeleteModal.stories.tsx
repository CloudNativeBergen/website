import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { SponsorDeleteModal } from './SponsorDeleteModal'

const meta = {
  title: 'Systems/Sponsors/Admin/Pipeline/SponsorDeleteModal',
  component: SponsorDeleteModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Confirmation modal for deleting sponsors from the CRM pipeline. Supports single and bulk delete with optional cleanup actions for pending signing agreements and contract PDFs.',
      },
    },
  },
  args: {
    isOpen: true,
    onClose: fn(),
    onConfirm: fn(),
    count: 1,
  },
} satisfies Meta<typeof SponsorDeleteModal>

export default meta
type Story = StoryObj<typeof meta>

export const SingleSponsor: Story = {
  args: {
    count: 1,
  },
}

export const BulkDelete: Story = {
  args: {
    count: 5,
  },
}

export const WithPendingAgreement: Story = {
  args: {
    count: 1,
    hasPendingAgreement: true,
  },
}

export const WithContractDocument: Story = {
  args: {
    count: 1,
    hasContractDocument: true,
  },
}

export const AllCleanupOptions: Story = {
  args: {
    count: 3,
    hasPendingAgreement: true,
    hasContractDocument: true,
  },
}

export const Loading: Story = {
  args: {
    count: 1,
    isLoading: true,
  },
}
