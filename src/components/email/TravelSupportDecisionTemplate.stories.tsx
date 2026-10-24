import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { TravelSupportDecisionTemplate } from './TravelSupportDecisionTemplate'

/**
 * The email a speaker gets when an organizer decides on their travel support
 * request (approved, rejected, paid) or on one of its expenses (approved,
 * rejected). The same news lands as a hub notification.
 *
 * Emails are inline-styled HTML with no dark mode, so these render on a fixed
 * light surface deliberately.
 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-900">
      <div className="mx-auto max-w-[680px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {children}
      </div>
    </div>
  )
}

const meta = {
  title: 'Systems/Email/Travel Support Decision',
  component: TravelSupportDecisionTemplate,
  args: {
    speakerName: 'Ada Lovelace',
    decision: 'Travel support approved',
    travelSupportUrl: 'https://cloudnativebergen.dev/cfp/expense',
    eventName: 'Cloud Native Days Bergen',
    eventLocation: 'Bergen, Norway',
    eventDate: 'October 28, 2026',
    eventUrl: 'https://cloudnativebergen.dev',
    socialLinks: ['https://github.com/cnbergen'],
  },
  decorators: [
    (Story: () => React.ReactElement) => (
      <Frame>
        <Story />
      </Frame>
    ),
  ],
  parameters: { layout: 'fullscreen', options: { showPanel: false } },
} satisfies Meta<typeof TravelSupportDecisionTemplate>

export default meta
type Story = StoryObj<typeof meta>

export const Approved: Story = {
  args: { notes: 'Approved up to 4 000 NOK for flights and two nights.' },
}

export const ExpenseRejected: Story = {
  args: {
    decision: 'Expense rejected',
    notes: 'The receipt is missing. Upload it and we will look again.',
  },
}
