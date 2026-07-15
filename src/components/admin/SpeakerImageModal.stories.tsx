import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { SpeakerImageModal } from './SpeakerImageModal'

// Inline SVG portrait so the story renders deterministically without any
// network request (speakerImageUrl returns non-Sanity URLs untouched).
const PORTRAIT =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
      <rect width="400" height="400" fill="#1d4ed8"/>
      <circle cx="200" cy="150" r="80" fill="#93c5fd"/>
      <rect x="90" y="240" width="220" height="160" rx="110" fill="#93c5fd"/>
      <text x="200" y="380" font-family="sans-serif" font-size="24" fill="#fff" text-anchor="middle">Speaker photo</text>
    </svg>`,
  )

const meta = {
  title: 'Systems/Speakers/Admin/SpeakerImageModal',
  component: SpeakerImageModal,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A lightweight modal (built on ModalShell) that shows a speaker photo at a large size during talk review. Opened by clicking a speaker avatar in ProposalDetail. Closes on ESC, backdrop click, or the close button.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    onClose: fn(),
  },
} satisfies Meta<typeof SpeakerImageModal>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {
  args: {
    isOpen: true,
    speaker: {
      name: 'Jane Doe',
      title: 'Senior Engineer at CloudCorp',
      image: PORTRAIT,
    },
  },
}

export const NameOnly: Story = {
  args: {
    isOpen: true,
    speaker: {
      name: 'Alex Rivera',
      image: PORTRAIT,
    },
  },
}

/**
 * Interactive example mirroring the ProposalDetail flow: a focusable avatar
 * button opens the modal, and ESC / the close button dismiss it.
 */
export const Interactive: Story = {
  args: {
    isOpen: false,
    speaker: {
      name: 'Jane Doe',
      title: 'Senior Engineer at CloudCorp',
      image: PORTRAIT,
    },
  },
  render: (args) => {
    function Demo() {
      const [isOpen, setIsOpen] = useState(false)
      return (
        <>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label={`View ${args.speaker.name}'s photo`}
            className="block h-16 w-16 overflow-hidden rounded-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <img
              src={args.speaker.image}
              alt={args.speaker.name}
              className="h-full w-full object-cover"
            />
          </button>
          <SpeakerImageModal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            speaker={args.speaker}
          />
        </>
      )
    }
    return <Demo />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', {
      name: "View Jane Doe's photo",
    })

    // Avatar is keyboard-focusable and opens the modal on activation.
    trigger.focus()
    await expect(trigger).toHaveFocus()
    await userEvent.keyboard('{Enter}')

    const dialog = within(document.body)
    await waitFor(() => expect(dialog.getByRole('dialog')).toBeInTheDocument())
    await expect(dialog.getByText('Jane Doe')).toBeInTheDocument()

    // ESC closes it.
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(dialog.queryByRole('dialog')).not.toBeInTheDocument(),
    )
  },
}
