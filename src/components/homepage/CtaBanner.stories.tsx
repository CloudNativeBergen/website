import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { CtaBanner } from './CtaBanner'

const meta = {
  title: 'Systems/Homepage/Public/CtaBanner',
  component: CtaBanner,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Front-page builder (F2) generic call-to-action block: heading + optional body + exactly one house Button. A closed-registry primitive — copy and destination are the only tenant inputs, so there is no raw-HTML surface. Two variants: `plain` (the default — the content on the page background) and `panel` (the same content boxed in the rounded gradient card the sponsor pitch already uses). Still exactly one button in both.',
      },
    },
  },
  argTypes: { section: { control: false } },
  tags: ['autodocs'],
} satisfies Meta<typeof CtaBanner>

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

/* ------------------------------ plain (default) ------------------------- */

export const Default: Story = {
  args: {
    section: {
      _key: 'cta-1',
      _type: 'homepageCtaBanner',
      heading: 'Ready to join the voyage?',
      body: 'Grab your ticket before early-bird pricing ends.',
      buttonLabel: 'Get your ticket',
      buttonHref: '/tickets',
    },
  },
}

export const HeadingOnly: Story = {
  args: {
    section: {
      _key: 'cta-2',
      _type: 'homepageCtaBanner',
      heading: 'Call for Papers is open',
      buttonLabel: 'Submit a talk',
      buttonHref: '/cfp',
    },
  },
}

export const Dark: Story = {
  args: Default.args,
  ...dark,
}

/* --------------------------------- panel -------------------------------- */

/**
 * `panel`: the louder option, for a page whose neighbouring bands are also
 * plain and where the default banner is easy to scroll straight past. The
 * gradient is brand-tinted, so a themed conference gets its own panel.
 */
export const Panel: Story = {
  args: {
    section: {
      _key: 'cta-3',
      _type: 'homepageCtaBanner',
      variant: 'panel',
      heading: 'Early-bird tickets close on 1 September',
      body: 'Two days at Grieghallen, 27–28 October. 32 sessions across three tracks, lunch and the after-party included — 1 500 kr until prices go up.',
      buttonLabel: 'Get your ticket',
      buttonHref: '/tickets',
    },
  },
}

export const PanelDark: Story = {
  args: Panel.args,
  ...dark,
}
