import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { AddTrackModal } from './AddTrackModal'

// The REAL modal — it renders its own fixed overlay and manages its own form
// state, so it stands alone with just the two callbacks. Footer order follows
// the house convention: Cancel on the left, the primary action on the right.

const meta = {
  title: 'Systems/Program/Admin/AddTrackModal',
  component: AddTrackModal,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Modal for adding a new track to the schedule editor: a title (required) and an optional description. Escape closes, focus is trapped and restored, and the title input is auto-focused on open.',
      },
    },
  },
  args: {
    onAdd: fn(),
    onCancel: fn(),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AddTrackModal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
