import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { AnalysisUnavailable } from './AnalysisUnavailable'

const meta = {
  title: 'Systems/Tickets/Admin/AnalysisUnavailable',
  component: AnalysisUnavailable,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'What /admin/tickets shows when the sales analysis throws. It replaces the stat cards and the chart — there is no substitute analysis behind it, because the zeroed stand-in it replaced rendered "Target Progress 0.0% · On Track" for a conference nobody had actually measured.',
      },
    },
  },
  args: { error: 'Invalid time value' },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AnalysisUnavailable>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('alert')).toBeVisible()
    // The failure must never be dressed up as a measured zero.
    await expect(canvas.queryByText(/On Track/)).toBeNull()
  },
}

/** A long provider message must wrap inside the card, not push it wide. */
export const LongError: Story = {
  args: {
    error:
      'TypeError: Cannot read properties of undefined (reading "targetPercentage") at TicketSalesProcessor.calculatePerformance',
  },
}

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'phone' } },
}
