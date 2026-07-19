import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { AddParticipantModal } from './AddParticipantModal'
import { withPortalTheme } from '@/lib/storybook'

const meta = {
  title: 'Systems/Proposals/Admin/Workshop/AddParticipantModal',
  component: AddParticipantModal,
  tags: ['autodocs'],
  decorators: [withPortalTheme],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Form modal for manually adding a participant to a workshop. Includes fields for name, email, WorkOS ID, experience level, and operating system. Built on the shared ModalShell — the workshop title uses the standard header (truncating cleanly), replacing the old bespoke absolute close button.',
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

/**
 * A very long workshop title. It now flows into ModalShell's standard header,
 * which truncates the subtitle and keeps the close button clear — the old
 * bespoke absolutely-positioned close X used to overlap the title text.
 */
export const LongTitle: Story = {
  args: {
    isOpen: true,
    workshopTitle:
      'Building Production-Grade Multi-Cluster Kubernetes Platforms with GitOps, Service Mesh, and Progressive Delivery',
  },
}
