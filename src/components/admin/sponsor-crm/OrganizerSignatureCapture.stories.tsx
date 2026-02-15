import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { OrganizerSignatureCapture } from './OrganizerSignatureCapture'

const meta = {
  title: 'Systems/Sponsors/Contract/OrganizerSignatureCapture',
  component: OrganizerSignatureCapture,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Captures the assigned organizer&apos;s counter-signature before sending a contract. Signature is saved in localStorage (never on the server) and reused across sessions. Only the organizer assigned to the sponsor can counter-sign.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    organizerId: 'speaker-123',
    organizerName: 'Jane Organizer',
    onSignatureReady: fn(),
  },
} satisfies Meta<typeof OrganizerSignatureCapture>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Initial state with no saved signature. Shows the signature pad canvas for drawing.',
      },
    },
  },
}

export const Disabled: Story = {
  args: {
    disabled: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'When disabled, the component renders nothing if no signature is saved, or shows a read-only preview if one exists in localStorage.',
      },
    },
  },
}

export const DifferentOrganizer: Story = {
  args: {
    organizerId: 'speaker-456',
    organizerName: 'Bob Smith',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Each organizer gets their own localStorage key based on their ID, so signatures are scoped per-user.',
      },
    },
  },
}
