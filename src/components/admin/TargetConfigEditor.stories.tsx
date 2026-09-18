import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { TargetConfigEditor } from './TargetConfigEditor'
import { NotificationProvider } from './NotificationProvider'

const meta = {
  title: 'Systems/Tickets/Admin/TargetConfigEditor',
  component: TargetConfigEditor,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The collapsed target-configuration card under the /admin/tickets chart. Its one-line summary states progress against the SELLABLE capacity — and a conference that has never set one has capacity 0, which is not a denominator.',
      },
    },
  },
  args: {
    currentConfig: {
      enabled: true,
      salesStartDate: '2026-01-15',
      targetCurve: 'late_push',
      milestones: [],
    },
    capacity: 300,
    currentTicketsSold: 166,
  },
  decorators: [
    // The editor raises a toast when a ticket-date save re-dates the Marketing
    // Plan (#1078), so it needs the provider `useNotification` reads — without
    // it every play function throws before reaching its assertions.
    (Story) => (
      <NotificationProvider>
        <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
} satisfies Meta<typeof TargetConfigEditor>

export default meta
type Story = StoryObj<typeof meta>

/** A configured conference: the percentage is a real measurement. */
export const Configured: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText(/166\/300 tickets \(55%\)/),
    ).toBeVisible()
  },
}

/**
 * NO CAPACITY SET — 0 means "never configured" (see `lib/tickets/config`), so
 * there is nothing to be a percentage OF. Dividing by it rendered "Infinity%",
 * or "NaN%" before the first sale, as if either were a measurement.
 */
export const CapacityNotSet: Story = {
  args: { capacity: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/166\/— tickets/)).toBeVisible()
    await expect(canvas.queryByText(/Infinity/)).toBeNull()
    await expect(canvas.queryByText(/NaN/)).toBeNull()
    await expect(canvas.queryByText(/%\)/)).toBeNull()
  },
}

/** No capacity and no sales: the shape that produced "NaN%". */
export const CapacityNotSetNoSales: Story = {
  args: { capacity: 0, currentTicketsSold: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/0\/— tickets/)).toBeVisible()
    await expect(canvas.queryByText(/NaN/)).toBeNull()
  },
}
