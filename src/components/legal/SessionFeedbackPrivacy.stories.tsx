import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import {
  SessionFeedbackCookieNote,
  SessionFeedbackPrivacy,
} from './SessionFeedbackPrivacy'

const meta = {
  title: 'Components/SessionFeedbackPrivacy',
  component: SessionFeedbackPrivacy,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'How /privacy describes Session Feedback (speaker feedback spec §8): its own card in section 2, and its cookie in the cookies section. Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof SessionFeedbackPrivacy>

export default meta
type Story = StoryObj<typeof meta>

export const Section: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { level: 3, name: 'Session Feedback' }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByText(/No name, email or IP address is collected\./),
    ).toBeInTheDocument()
  },
}

export const CookieNote: Story = {
  render: () => <SessionFeedbackCookieNote />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/expires 30 days after your last answer/),
    ).toBeInTheDocument()
  },
}

export const SectionDark: Story = { ...Section, globals: { theme: 'dark' } }

export const CookieNoteDark: Story = {
  ...CookieNote,
  globals: { theme: 'dark' },
}
