import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { RichTextBlock } from './RichTextBlock'
import type { TypedObject } from 'sanity'

const sampleContent: TypedObject[] = [
  {
    _type: 'block',
    _key: 'b1',
    style: 'h2',
    children: [{ _type: 'span', _key: 's1', text: 'Why attend?', marks: [] }],
    markDefs: [],
  },
  {
    _type: 'block',
    _key: 'b2',
    style: 'normal',
    children: [
      {
        _type: 'span',
        _key: 's2',
        text: 'Two days of deep, vendor-neutral cloud native content from the people building the platforms Norway runs on.',
        marks: [],
      },
    ],
    markDefs: [],
  },
]

const meta = {
  title: 'Systems/Homepage/Public/RichTextBlock',
  component: RichTextBlock,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Front-page builder (F2) generic portable-text block, rendered with the shared site portable-text components. The registry is closed to portable text (no raw HTML/embeds) so brand styling and safety stay under our control.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof RichTextBlock>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    section: {
      _key: 'rt-1',
      _type: 'homepageRichText',
      heading: 'About the conference',
      content: sampleContent,
    },
  },
}

export const NoHeading: Story = {
  args: {
    section: {
      _key: 'rt-2',
      _type: 'homepageRichText',
      content: sampleContent,
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
