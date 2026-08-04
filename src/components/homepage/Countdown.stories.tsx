import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
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
          'Front-page builder (F4) countdown. SSR-safe: the target arrives as a plain `targetMs` prop; the first render (server + first client) shows an em-dash placeholder, then the effect ticks once a second after hydration. After the target passes it shows `liveMessage`, or hides when that is blank. Two variants: `units` (the default — four large day/hour/minute/second tiles owning a full band) and `strip` (the same numbers on ONE line inside a slim tinted bar, for a page that wants a persistent reminder rather than a centrepiece).',
      },
    },
  },
  argTypes: {
    variant: {
      control: 'radio',
      options: [undefined, 'units', 'strip'],
      description: 'Presentation variant. Absent = `units` (the default).',
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Countdown>

export default meta
type Story = StoryObj<typeof meta>

const darkDecorator: Decorator[] = [
  (Story) => (
    <div className="dark bg-gray-950">
      <Story />
    </div>
  ),
]

const dark = {
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: darkDecorator,
}

/* ------------------------------ units (default) ------------------------- */

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
  ...dark,
}

/* --------------------------------- strip -------------------------------- */

/**
 * `strip`: one line, a fraction of the height. The heading sits inline with the
 * numbers on a wide screen and wraps above them on a phone. Unit words are
 * spelt out — a row of `d/h/m/s` suffixes is all a screen reader would get.
 */
export const Strip: Story = {
  args: {
    heading: 'Cloud Native Days Norway starts in',
    targetMs: FIXED_NOW + 90 * 86_400_000 + 5 * 3_600_000,
    variant: 'strip',
  },
}

export const StripDark: Story = {
  args: Strip.args,
  ...dark,
}

/** The strip without a heading — the reminder bar at its slimmest. */
export const StripNoHeading: Story = {
  args: {
    targetMs: FIXED_NOW + 12 * 86_400_000 + 3 * 3_600_000,
    variant: 'strip',
  },
}

/** Edge case: the strip after the target, carrying the live message. */
export const StripPastWithLiveMessage: Story = {
  args: {
    targetMs: FIXED_NOW - 3_600_000,
    liveMessage: 'We are live — welcome to Bergen!',
    variant: 'strip',
  },
}
