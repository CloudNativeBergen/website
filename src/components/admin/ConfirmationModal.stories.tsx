import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ConfirmationModal } from './ConfirmationModal'

const meta = {
  title: 'Components/Feedback/ConfirmationModal',
  component: ConfirmationModal,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A reusable confirmation dialog with support for danger, warning, and info variants. Used throughout the admin interface for destructive actions.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof ConfirmationModal>

export default meta
type Story = StoryObj<typeof meta>

export const Danger: Story = {
  args: {
    isOpen: true,
    title: 'Delete proposal?',
    message:
      'This action cannot be undone. The proposal and all associated reviews will be permanently deleted.',
    confirmButtonText: 'Delete',
    variant: 'danger',
  },
}

export const Warning: Story = {
  args: {
    isOpen: true,
    title: 'Reject proposal?',
    message:
      'This will send a rejection notification to the speaker. You can change the decision later if needed.',
    confirmButtonText: 'Reject',
    variant: 'warning',
  },
}

export const Info: Story = {
  args: {
    isOpen: true,
    title: 'Accept proposal?',
    message:
      'This will send an acceptance notification to the speaker and add the talk to the schedule.',
    confirmButtonText: 'Accept',
    variant: 'info',
  },
}

export const Loading: Story = {
  args: {
    isOpen: true,
    title: 'Processing...',
    message: 'Please wait while we process your request.',
    confirmButtonText: 'Confirm',
    variant: 'info',
    isLoading: true,
  },
}

export const CustomButtons: Story = {
  args: {
    isOpen: true,
    title: 'Withdraw talk?',
    message: 'Are you sure you want to withdraw this talk from the conference?',
    confirmButtonText: 'Yes, withdraw',
    cancelButtonText: 'No, keep it',
    variant: 'warning',
  },
}
