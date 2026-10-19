import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { feedbackTotals } from '@/lib/feedback/totals'
import { FeedbackResultsView } from './FeedbackResultsView'

const meta = {
  title: 'Systems/Proposals/Session Feedback/FeedbackResultsView',
  component: FeedbackResultsView,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'The **Session Feedback** tab’s content (speaker feedback spec §9.3): a stacked colour bar, combined totals per colour (scanned plus Card Counts, with a Scanned vs cards breakdown), a Live badge while the window is open, and the visible comments oldest first. Presentational. Dark mode follows the global `theme` toolbar (story-level `globals`).',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-lg border border-gray-200 bg-white p-4 sm:p-6 dark:border-gray-700 dark:bg-gray-800">
        <Story />
      </div>
    ),
  ],
  args: {
    live: false,
    totals: feedbackTotals({
      live: { green: 18, yellow: 4, red: 1 },
      cards: { greenCount: 6, yellowCount: 1, redCount: 0 },
    }),
    comments: [
      {
        id: 'feedbackResponse-1',
        colour: 'green',
        comment: 'Loved the war stories. More of those next year, please!',
        submittedAt: '2026-10-27T09:41:00.000Z',
      },
      {
        id: 'feedbackResponse-2',
        colour: 'red',
        comment:
          'I came for the hands-on part described in the abstract and it never happened. The first half was a product pitch.\n\nThe Q&A was good though.',
        submittedAt: '2026-10-27T09:47:00.000Z',
      },
    ],
  },
} satisfies Meta<typeof FeedbackResultsView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Dark: Story = { globals: { theme: 'dark' } }

/** Phone width: three tiles side by side, a long comment wraps. */
export const Phone: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

export const PhoneDark: Story = { ...Phone, globals: { theme: 'dark' } }

/** Live, before anyone answered. */
export const LiveNoAnswersYet: Story = {
  args: {
    live: true,
    totals: feedbackTotals({ live: { green: 0, yellow: 0, red: 0 } }),
    comments: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Live')).toBeVisible()
    expect(
      canvas.getByText(
        'No answers yet. They appear here as attendees scan your code.',
      ),
    ).toBeVisible()
    // Nothing to break down without Card Counts.
    expect(
      canvas.queryByRole('button', { name: 'Scanned vs cards' }),
    ).toBeNull()
  },
}

/** Scanned answers only: no breakdown toggle, a single colour fills the bar. */
export const ScannedOnly: Story = {
  args: {
    totals: feedbackTotals({ live: { green: 7, yellow: 0, red: 0 } }),
    comments: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('7 responses · 0 comments')).toBeVisible()
    expect(canvas.getByText('100%')).toBeVisible()
  },
}
