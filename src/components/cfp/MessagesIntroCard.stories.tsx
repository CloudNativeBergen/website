import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { mockDateBeforeEach } from '@/lib/storybook'
import { MessagesIntroCard } from './MessagesIntroCard'

// `forceVisible` bypasses the localStorage read so both states render
// deterministically in isolation (the real app persists dismissal under
// `cndn.messagesIntro.v1`).

const meta = {
  title: 'Systems/CFP/MessagesIntroCard',
  component: MessagesIntroCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Dismissible adoption card on the speaker dashboard announcing the Messages feature (V2d). Renders only for signed-in speakers (mounted on /cfp/list) and persists dismissal in localStorage.',
      },
    },
  },
  tags: ['autodocs'],
  beforeEach: mockDateBeforeEach(new Date('2025-01-15T09:00:00Z')),
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MessagesIntroCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { forceVisible: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(
      await canvas.findByRole('heading', { name: /New: Messages/i }),
    ).toBeInTheDocument()
    expect(
      canvas.getByRole('link', { name: /Open Messages/i }),
    ).toHaveAttribute('href', '/cfp/messages')
    expect(canvas.getByRole('button', { name: /Dismiss/i })).toBeInTheDocument()
  },
}

export const Dismissed: Story = {
  args: { forceVisible: false },
  parameters: {
    docs: {
      description: {
        story:
          'After dismissal the card renders nothing (the dashboard reclaims the space).',
      },
    },
  },
}
