import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { EditCapacityModal } from './EditCapacityModal'

const meta = {
  title: 'Systems/Proposals/Admin/Workshop/EditCapacityModal',
  component: EditCapacityModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Simple modal for editing the max capacity of a workshop. Shows current signup count and validates that capacity cannot be set below existing signups.',
      },
    },
  },
  args: {
    onClose: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof EditCapacityModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    isOpen: true,
    workshopTitle: 'Getting Started with Kubernetes',
    currentCapacity: 30,
    currentSignups: 12,
  },
}

export const NearCapacity: Story = {
  args: {
    isOpen: true,
    workshopTitle: 'Advanced Terraform Workshop',
    currentCapacity: 20,
    currentSignups: 19,
  },
}

export const Submitting: Story = {
  args: {
    isOpen: true,
    workshopTitle: 'Cloud Security Fundamentals',
    currentCapacity: 25,
    currentSignups: 10,
    isSubmitting: true,
  },
}
