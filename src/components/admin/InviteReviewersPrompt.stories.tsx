import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { InviteReviewersPrompt } from './InviteReviewersPrompt'

// `forceVisible` bypasses the localStorage read so the visible state renders
// deterministically in isolation (the real app persists dismissal under
// `cndn.inviteReviewers.v1`). The condition props still gate: one organizer,
// at least one proposal.

const meta = {
  title: 'Systems/Admin/InviteReviewersPrompt',
  component: InviteReviewersPrompt,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Dismissible nudge on /admin/proposals when the first proposal arrives and the conference still has exactly one organizer (platform#49 phase 2). Links to the organizer section of settings; dismissal persists in localStorage.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InviteReviewersPrompt>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { organizerCount: 1, proposalCount: 1, forceVisible: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/invite your reviewers/i)).toBeInTheDocument()
  },
}

/** With two organizers the prompt must not render, whatever the seam says. */
export const StaffedConferenceRendersNothing: Story = {
  args: { organizerCount: 2, proposalCount: 5, forceVisible: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText(/invite your reviewers/i)).toBeNull()
  },
}
