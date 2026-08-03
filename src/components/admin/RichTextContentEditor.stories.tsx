import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { RichTextContentEditor } from './RichTextContentEditor'
import type { RichTextContentBlock } from '@/lib/homepage/richText'

const seeded: RichTextContentBlock[] = [
  {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    markDefs: [],
    children: [
      {
        _type: 'span',
        _key: 's1',
        text: 'Everything you need to know about the venue.',
        marks: [],
      },
    ],
  },
  {
    _type: 'richTextCode',
    _key: 'c1',
    language: 'yaml',
    filename: 'venue.yaml',
    code: 'kind: Venue\nmetadata:\n  name: grieghallen',
  },
  {
    _type: 'richTextCallout',
    _key: 'k1',
    tone: 'warning',
    title: 'Doors open at 08:00',
    body: 'Registration closes at 09:30 sharp.',
  },
  {
    _type: 'richTextTable',
    _key: 't1',
    headerRow: true,
    rows: [
      { _key: 'r0', cells: ['Room', 'Track'] },
      { _key: 'r1', cells: ['Peer Gynt', 'Platform Engineering'] },
    ],
  },
]

/**
 * Wrapper so the stories behave like the real editor (the component pushes a
 * flattened array up on every edit).
 */
function Harness({ initial }: { initial: RichTextContentBlock[] }) {
  const [value, setValue] = useState(initial)
  return (
    <div className="max-w-2xl p-4">
      <RichTextContentEditor value={value} onChange={setValue} />
    </div>
  )
}

const meta = {
  title: 'Systems/Settings/Admin/RichTextContentEditor',
  component: RichTextContentEditor,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The organizer-facing editor for the homepage Rich Text block. Contiguous prose collapses into one prose editor; each code/image/table/callout block is its own reorderable card, so content can be interleaved in any order. The help text states plainly that this is not an HTML block — pasted markup, scripts, iframes, embeds and remote images are removed on save.',
      },
    },
  },
} satisfies Meta<typeof RichTextContentEditor>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  render: () => <Harness initial={[]} />,
  args: { value: [], onChange: () => {} },
}

export const WithContent: Story = {
  render: () => <Harness initial={seeded} />,
  args: { value: seeded, onChange: () => {} },
}

export const WithContentDark: Story = {
  render: () => <Harness initial={seeded} />,
  args: { value: seeded, onChange: () => {} },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div className="dark bg-gray-900 text-white">
        <Story />
      </div>
    ),
  ],
}
