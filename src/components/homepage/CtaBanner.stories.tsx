import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CtaBanner } from './CtaBanner'

const meta = {
  title: 'Systems/Homepage/Public/CtaBanner',
  component: CtaBanner,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Front-page builder (F2) generic call-to-action block: heading + optional body + exactly one house Button. A closed-registry primitive — copy and destination are the only tenant inputs, so there is no raw-HTML surface.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof CtaBanner>

export default meta
type Story = StoryObj<typeof meta>

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
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-950">
        <Story />
      </div>
    ),
  ],
}
