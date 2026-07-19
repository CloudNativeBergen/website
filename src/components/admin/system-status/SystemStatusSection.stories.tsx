import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SystemStatusSection } from './SystemStatusSection'
import { fixtureChecks } from './fixtures'

const meta = {
  title: 'Systems/Admin/SystemStatus/SystemStatusSection',
  component: SystemStatusSection,
  parameters: { layout: 'fullscreen' },
  args: { checks: fixtureChecks },
  tags: ['autodocs'],
} satisfies Meta<typeof SystemStatusSection>

export default meta
type Story = StoryObj<typeof meta>

export const AllStatuses: Story = {
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-gray-50 p-4">
        <Story />
      </div>
    ),
  ],
}

export const Dark: Story = {
  decorators: [
    (Story) => (
      <div className="dark min-h-screen bg-gray-950 p-4">
        <Story />
      </div>
    ),
  ],
}
