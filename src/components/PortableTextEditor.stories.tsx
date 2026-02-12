import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { PortableTextBlock } from '@portabletext/editor'
import { useState } from 'react'
import { PortableTextEditor } from './PortableTextEditor'

const meta = {
  title: 'Components/Forms/PortableTextEditor',
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  render: () => {
    const Wrapper = () => {
      const [value, setValue] = useState<PortableTextBlock[]>([])
      return (
        <PortableTextEditor
          label="Description"
          value={value}
          onChange={setValue}
          helpText="Use the toolbar to format your text with headings, bold, italic, lists, and links."
        />
      )
    }
    return <Wrapper />
  },
}

export const WithContent: Story = {
  render: () => {
    const Wrapper = () => {
      const initialValue: PortableTextBlock[] = [
        {
          _type: 'block',
          _key: 'intro',
          style: 'h2',
          children: [
            {
              _type: 'span',
              _key: 'intro-span',
              text: 'About This Talk',
              marks: [],
            },
          ],
          markDefs: [],
        },
        {
          _type: 'block',
          _key: 'body',
          style: 'normal',
          children: [
            {
              _type: 'span',
              _key: 'body-span',
              text: 'This talk explores how to build ',
              marks: [],
            },
            {
              _type: 'span',
              _key: 'body-bold',
              text: 'resilient microservices',
              marks: ['strong'],
            },
            {
              _type: 'span',
              _key: 'body-rest',
              text: ' using Kubernetes and cloud native patterns.',
              marks: [],
            },
          ],
          markDefs: [],
        },
      ]
      const [value, setValue] = useState<PortableTextBlock[]>(initialValue)
      return (
        <PortableTextEditor
          label="Talk Abstract"
          value={value}
          onChange={setValue}
        />
      )
    }
    return <Wrapper />
  },
}
