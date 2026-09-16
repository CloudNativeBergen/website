import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { CurveSelectionGrid } from './CurvePreview'

/**
 * The target-curve picker inside the ticket target config. Two columns on a
 * phone, four from `sm` — the story exists so the phone width is inspectable;
 * the audit could only read it.
 */
const meta = {
  title: 'Systems/Tickets/Admin/CurveSelectionGrid',
  component: CurveSelectionGrid,
  parameters: { layout: 'fullscreen' },
  args: { selected: 'linear' as const, onSelect: fn() },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CurveSelectionGrid>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'phone' } },
}

export const MobileDark: Story = {
  globals: { theme: 'dark' },
  parameters: { viewport: { defaultViewport: 'phone' } },
}
