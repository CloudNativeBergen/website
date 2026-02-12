import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { AddParticipantModal } from './AddParticipantModal'

const meta = {
  title: 'Systems/Proposals/Admin/Workshop/AddParticipantModal',
  component: AddParticipantModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Form modal for manually adding a participant to a workshop. Includes fields for name, email, WorkOS ID, experience level, and operating system.',
      },
    },
  },
  args: {
    onClose: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof AddParticipantModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    isOpen: true,
    workshopTitle: 'Getting Started with Kubernetes',
  },
}

export const Submitting: Story = {
  args: {
    isOpen: true,
    workshopTitle: 'Advanced Terraform Workshop',
    isSubmitting: true,
  },
}
