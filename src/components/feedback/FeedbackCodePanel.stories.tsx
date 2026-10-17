import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FeedbackCodePanel } from './FeedbackCodePanel'

const URL = 'https://2026.cloudnativedays.no/f/k7m2qx'

const meta = {
  title: 'Systems/Proposals/Session Feedback/FeedbackCodePanel',
  component: FeedbackCodePanel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The Feedback Code tab of the speaker’s Session Feedback section: the QR code for the attendee URL, the code’s state from the Feedback Window, and Copy link. Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
  },
  args: { url: URL, window: { state: 'unscheduled', feedbackVisible: false } },
} satisfies Meta<typeof FeedbackCodePanel>

export default meta
type Story = StoryObj<typeof meta>

const before = {
  state: 'before',
  opensAt: '2026-10-29T08:00:00.000Z',
  lastSlotEnd: '2026-10-29T08:40:00.000Z',
  closesAt: '2026-10-30T08:40:00.000Z',
  feedbackVisible: false,
} as const

export const Unscheduled: Story = {}

export const BeforeSession: Story = { args: { window: before } }

export const Open: Story = {
  args: { window: { ...before, state: 'open', feedbackVisible: true } },
}

export const Closed: Story = {
  args: { window: { ...before, state: 'closed', feedbackVisible: true } },
}

export const OpenDark: Story = {
  ...Open,
  globals: { theme: 'dark' },
}
