import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { WidgetErrorBoundary } from './WidgetErrorBoundary'

/**
 * Fallback card shown when a widget crashes during render. It must be legible
 * in BOTH themes and offer a "Try again" reset so a transient crash does not
 * require a full page reload. (The data-fetching widgets themselves are not
 * storyable in isolation — they call server actions internally.)
 */
const meta = {
  title: 'Admin/Dashboard/WidgetErrorBoundary',
  component: WidgetErrorBoundary,
  parameters: { layout: 'padded' },
  decorators: [
    (Story, ctx) => (
      <div className={ctx.parameters.dark ? 'dark bg-gray-950 p-4' : 'p-4'}>
        <div className="mx-auto h-full w-full max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof WidgetErrorBoundary>

export default meta
type Story = StoryObj<typeof meta>

function Bomb(): React.ReactNode {
  throw new Error('Simulated widget render crash')
}

export const Fallback: Story = {
  args: {
    widgetName: 'Ticket Sales',
    children: <Bomb />,
  },
}

export const FallbackDark: Story = {
  args: {
    widgetName: 'Ticket Sales',
    children: <Bomb />,
  },
  parameters: { dark: true },
}
