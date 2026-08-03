import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { screen, userEvent } from 'storybook/test'
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
          "The organizer-facing editor for the homepage Rich Text block. Contiguous prose collapses into one prose editor; each code/image/table/callout block is its own reorderable card, so content can be interleaved in any order. The help text states plainly that this is not an HTML block — pasted markup, scripts, iframes, embeds and third-party widgets are stripped as you paste, while SVG and images hosted elsewhere are refused with an error. The image picker's accepted types are derived from the upload allowlist (RICH_TEXT_IMAGE_MIME_TYPES), so it can never drift from what the API accepts.",
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

/**
 * A freshly added Image card. Both the file picker's `accept` list and the
 * format line under it are derived from `RICH_TEXT_IMAGE_MIME_TYPES`, so AVIF —
 * which the upload API has always accepted — is offered here too. Added via the
 * button rather than seeded, because an image card with no asset yet is exactly
 * what the sanitizer drops on load.
 */
export const NewImageCard: Story = {
  render: () => <Harness initial={[]} />,
  args: { value: [], onChange: () => {} },
  play: async () => {
    await userEvent.click(
      await screen.findByRole('button', { name: '+ Image' }),
    )
  },
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
