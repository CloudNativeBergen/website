import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { feedbackTotals } from '@/lib/feedback/totals'

import { SessionFeedbackSummaryTemplate } from './SessionFeedbackSummaryTemplate'

/**
 * The summary a speaker gets once their session's Feedback Window has closed
 * (speaker feedback spec §11.1): the combined totals per colour, the response
 * and comment counts, and a link to the results. Counts only, never comment
 * text.
 *
 * Emails are inline-styled HTML with no dark mode, so these render on a fixed
 * light surface deliberately: that is what lands in the inbox.
 */
const base = {
  speakerName: 'Ada Lovelace',
  talkTitle: 'Kubernetes at the edge',
  totals: feedbackTotals({
    live: { green: 12, yellow: 3, red: 1 },
    cards: { greenCount: 4, yellowCount: 0, redCount: 1 },
  }),
  comments: 4,
  resultsUrl:
    'https://cloudnativebergen.dev/cfp/proposal/talk-1#session-feedback',
  eventName: 'Cloud Native Days Bergen',
  eventLocation: 'Bergen, Norway',
  eventDate: 'October 28, 2026',
  eventUrl: 'https://cloudnativebergen.dev',
  socialLinks: ['https://github.com/cnbergen'],
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 dark:bg-gray-900">
      <div className="mx-auto max-w-[680px] overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        {children}
      </div>
    </div>
  )
}

const meta = {
  title: 'Systems/Email/Session Feedback Summary',
  component: SessionFeedbackSummaryTemplate,
  args: base,
  decorators: [
    (Story: () => React.ReactElement) => (
      <Frame>
        <Story />
      </Frame>
    ),
  ],
  parameters: { layout: 'fullscreen', options: { showPanel: false } },
} satisfies Meta<typeof SessionFeedbackSummaryTemplate>

export default meta
type Story = StoryObj<typeof meta>

/** Scanned answers and feedback cards, with comments. */
export const WithCardsAndComments: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('16')).toBeVisible()
    await expect(canvas.getByText('21 responses · 4 comments')).toBeVisible()
    await expect(
      canvas.getByText('Including 5 feedback cards counted in the room.'),
    ).toBeVisible()
    await expect(
      canvas.getByRole('link', { name: 'See your Session Feedback' }),
    ).toHaveAttribute('href', base.resultsUrl)
  },
}

/** Scanned answers only: no card line, and one of each in the singular. */
export const ScannedOnly: Story = {
  args: {
    totals: feedbackTotals({ live: { green: 1, yellow: 0, red: 0 } }),
    comments: 1,
    talkTitle:
      'A very long session title about running stateful workloads on Kubernetes across three regions without losing sleep',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('1 response · 1 comment')).toBeVisible()
    await expect(canvas.queryByText(/feedback card/)).toBeNull()
  },
}
