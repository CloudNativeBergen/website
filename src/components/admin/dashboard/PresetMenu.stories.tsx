import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn, userEvent, within } from 'storybook/test'
import { PresetMenu } from './PresetMenu'

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/PresetMenu',
  component: PresetMenu,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Edit-mode layout picker for the admin dashboard. Lists every preset from presets.ts; the caller shows a confirmation before the (destructive) apply. The default preset is marked, replacing the old standalone Reset button.',
      },
    },
  },
  args: {
    onSelect: fn(),
  },
  decorators: [
    (Story) => (
      // The control sits fixed at the dashboard's bottom-right and the menu
      // opens upward — mirror that placement so the panel is visible.
      <div className="flex min-h-[480px] items-end justify-end bg-gray-50 p-6 dark:bg-gray-900">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PresetMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Closed: Story = {}

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Layout/ }))
  },
}
