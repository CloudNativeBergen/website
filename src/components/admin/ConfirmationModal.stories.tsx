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

export const DashboardReset: Story = {
  args: {
    isOpen: true,
    title: 'Reset dashboard layout?',
    message:
      'This replaces your current widgets and layout with the default planning preset. This cannot be undone.',
    confirmButtonText: 'Reset layout',
    variant: 'danger',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Confirmation shown by the admin dashboard before the Reset control replaces the whole layout with the planning preset (a destructive, persisted action).',
      },
    },
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

export const WithdrawReasonRequired: Story = {
  args: {
    isOpen: true,
    title: 'Withdraw proposal?',
    message:
      'This will withdraw your proposal from the conference. This action cannot be undone.',
    confirmButtonText: 'Withdraw',
    variant: 'danger',
    // A mandatory reason keeps the confirm button disabled until it is filled in.
    confirmDisabled: true,
    children: (
      <div>
        <label
          htmlFor="withdraw-reason"
          className="font-inter block text-sm font-medium text-brand-slate-gray dark:text-gray-300"
        >
          Reason for withdrawal
          <span className="text-red-600 dark:text-red-400"> *</span>
        </label>
        <textarea
          id="withdraw-reason"
          rows={3}
          placeholder="Let the organizers know why you are withdrawing…"
          className="font-inter mt-1 block w-full rounded-lg border border-brand-frosted-steel bg-white px-3 py-2 text-sm text-brand-slate-gray shadow-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Withdrawal flow (#212): a mandatory reason is collected via the modal children, and the confirm button stays disabled until a reason is provided.',
      },
    },
  },
}
