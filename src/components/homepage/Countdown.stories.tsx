import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Countdown } from './Countdown'

const meta = {
  title: 'Systems/Homepage/Public/Countdown',
  component: Countdown,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Front-page builder (F4) countdown. SSR-safe: the target arrives as a plain `targetMs` prop; the first render (server + first client) shows an em-dash placeholder, then the effect ticks once a second after hydration. After the target passes it shows `liveMessage`, or hides when that is blank.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Countdown>

export default meta
type Story = StoryObj<typeof meta>

/** ~90 days out. */
export const Default: Story = {
  args: {
    heading: 'Cloud Native Days Norway starts in',
    targetMs: Date.now() + 90 * 86_400_000 + 5 * 3_600_000,
  },
}

export const NoHeading: Story = {
  args: {
    targetMs: Date.now() + 3 * 86_400_000,
  },
}

/** Edge case: target already passed, with a live message. */
export const PastWithLiveMessage: Story = {
  args: {
    heading: 'Countdown',
    targetMs: Date.now() - 3_600_000,
    liveMessage: 'We are live — welcome to the conference!',
  },
}

export const Dark: Story = {
  args: Default.args,
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-950">
        <Story />
      </div>
    ),
  ],
}
