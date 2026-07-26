import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Countdown } from './Countdown'

const FIXED_NOW = new Date('2026-03-01T12:00:00Z').getTime()

const meta = {
  beforeEach: () => {
    // Pin the clock (house pattern — see PaymentDetailsModal.stories): the
    // Countdown reads Date.now() every tick, so an unpinned clock would
    // drift Chromatic snapshots.
    const OriginalDate = globalThis.Date
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockDate: any = function (...args: any[]) {
      if (args.length === 0) return new OriginalDate(FIXED_NOW)
      return new (
        Function.prototype.bind.apply(OriginalDate, [
          null,
          ...args,
        ]) as typeof OriginalDate
      )()
    }
    Object.setPrototypeOf(MockDate, OriginalDate)
    MockDate.prototype = Object.create(OriginalDate.prototype)
    MockDate.now = () => FIXED_NOW
    MockDate.parse = OriginalDate.parse.bind(OriginalDate)
    MockDate.UTC = OriginalDate.UTC.bind(OriginalDate)
    globalThis.Date = MockDate
    return () => {
      globalThis.Date = OriginalDate
    }
  },

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
    targetMs: FIXED_NOW + 90 * 86_400_000 + 5 * 3_600_000,
  },
}

export const NoHeading: Story = {
  args: {
    targetMs: FIXED_NOW + 3 * 86_400_000,
  },
}

/** Edge case: target already passed, with a live message. */
export const PastWithLiveMessage: Story = {
  args: {
    heading: 'Countdown',
    targetMs: FIXED_NOW - 3_600_000,
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
