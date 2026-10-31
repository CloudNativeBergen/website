import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { ErasurePreview } from './ErasurePreview'
import { sharedSpeakerPreview } from './fixtures'

const meta = {
  title: 'Systems/Admin/Settings/Privacy Erasure Preview',
  component: ErasurePreview,
  args: { preview: sharedSpeakerPreview, onErase: fn() },
} satisfies Meta<typeof ErasurePreview>

export default meta
type Story = StoryObj<typeof meta>

export const SharedSpeaker: Story = {}

export const Refused: Story = {
  args: {
    preview: {
      ...sharedSpeakerPreview,
      refusals: ['Speaker speaker-1: sole organizer of Bergen 2026'],
    },
  },
}

export const Verified: Story = {
  args: {
    result: {
      clean: true,
      verification: [
        'Sponsor contacts: CLEAN',
        'Invitations and workshop signups at this organization: CLEAN',
      ],
      counts: { invitations: 1, signups: 1 },
    },
  },
}
