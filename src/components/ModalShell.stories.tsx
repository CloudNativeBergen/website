import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { ThemeProvider } from 'next-themes'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { fn, userEvent } from 'storybook/test'
import { ModalShell } from './ModalShell'

const meta: Meta<typeof ModalShell> = {
  title: 'Components/Feedback/ModalShell',
  component: ModalShell,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The shared modal primitive. Wraps HeadlessUI Dialog + Transition and provides the house backdrop (`bg-black/50`), a mobile bottom-sheet presentation (`sm+` stays a centered card), an opt-in standard header (`title`/`subtitle`/`icon`), and an opt-in dirty-close guard. Supply `isOpen`, `onClose`, `size`, and render children.',
      },
    },
  },
  decorators: [
    // ModalShell reads `next-themes`; HeadlessUI portals the dialog to
    // document.body, so the toolbar's decorator wrapper never reaches it.
    // React context DOES cross portals, so forcing the theme here (synced to
    // the Storybook theme global) is what actually renders the modal dark.
    (Story, context) => (
      <ThemeProvider
        attribute="class"
        forcedTheme={context.globals.theme === 'dark' ? 'dark' : 'light'}
      >
        <Story />
      </ThemeProvider>
    ),
  ],
  args: {
    isOpen: true,
    onClose: fn(),
  },
}

export default meta
type Story = StoryObj<typeof ModalShell>

export const Small: Story = {
  args: {
    size: 'sm',
    children: (
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Small Modal
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          A compact modal for simple confirmations or alerts.
        </p>
      </div>
    ),
  },
}

export const Medium: Story = {
  args: {
    size: 'md',
    children: (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Medium Modal
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          The default size, suitable for confirmation dialogs and small forms.
        </p>
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300"
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Confirm
          </button>
        </div>
      </div>
    ),
  },
}

export const Large: Story = {
  args: {
    size: '3xl',
    children: (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Large Modal
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          A wider modal for forms, email composers, or data-heavy content.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg bg-gray-100 p-4 dark:bg-gray-800"
            >
              <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mt-2 h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      </div>
    ),
  },
}

export const ExtraLarge: Story = {
  args: {
    size: '5xl',
    children: (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Extra Large Modal
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          For previews, image galleries, or complex multi-column layouts.
        </p>
      </div>
    ),
  },
}

export const Unpadded: Story = {
  args: {
    size: '3xl',
    padded: false,
    children: (
      <div>
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Custom Section Padding
          </h3>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Use <code>padded=false</code> when sections manage their own
            padding, such as modals with distinct header, body, and footer
            regions.
          </p>
        </div>
        <div className="flex justify-end border-t border-gray-200 px-6 py-4 dark:border-gray-700">
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    ),
  },
}

/**
 * The default `presentation="sheet"` renders a bottom sheet below the `sm`
 * breakpoint. Shoot this at 393px to see the sheet; at ≥640px it is the
 * centered card. The tall body demonstrates the scrollable, safe-area-padded
 * sheet body.
 */
export const SheetOnMobile: Story = {
  args: {
    size: 'lg',
    children: (
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Bottom Sheet
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          On phones this pins to the bottom with a rounded top edge and scrolls
          internally. On desktop it is the usual centered card.
        </p>
        <div className="mt-4 space-y-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg bg-gray-100 p-4 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            >
              Row {i + 1}
            </div>
          ))}
        </div>
      </div>
    ),
  },
}

/**
 * `presentation="centered"` forces the centered card at every size — the
 * opt-out for edge cases that should never become a bottom sheet.
 */
export const CenteredAtAllSizes: Story = {
  args: {
    size: 'md',
    presentation: 'centered',
    children: (
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Always Centered
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Stays a centered card even on a phone.
        </p>
      </div>
    ),
  },
}

/**
 * Opt-in standard header via `title`/`subtitle`/`icon`: renders the house
 * header (icon slot, `DialogTitle` wired to `aria-labelledby`, and a single
 * 44×44 close button).
 */
export const WithStandardHeader: Story = {
  args: {
    size: 'lg',
    padded: false,
    title: 'Compose message',
    subtitle: 'Proposal thread: Scaling Kubernetes at the edge',
    icon: <EnvelopeIcon className="h-5 w-5" aria-hidden="true" />,
    children: (
      <div className="p-6">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          The header above is provided by ModalShell. Body content renders below
          it.
        </p>
      </div>
    ),
  },
}

function DirtyGuardDemo() {
  const [open, setOpen] = useState(true)
  return (
    <ModalShell
      isOpen={open}
      onClose={() => setOpen(false)}
      size="md"
      title="Edit profile"
      confirmOnDirtyClose
      isDirty
    >
      <div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          There are unsaved changes. Press Escape or click the backdrop — the
          modal asks you to confirm before discarding.
        </p>
        <input
          type="text"
          defaultValue="Unsaved value"
          className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
      </div>
    </ModalShell>
  )
}

/**
 * With `confirmOnDirtyClose` + `isDirty`, a backdrop-click / Escape / header
 * close first reveals an in-dialog "Discard unsaved changes?" confirm. Open the
 * story and press Escape to see it.
 */
export const DirtyCloseGuard: Story = {
  render: () => <DirtyGuardDemo />,
}

/**
 * The same guard with the confirm already revealed (a play function presses
 * Escape on mount) so the in-dialog "Discard unsaved changes?" state is
 * captured in screenshots.
 */
export const DirtyCloseConfirmShown: Story = {
  render: () => <DirtyGuardDemo />,
  play: async () => {
    await userEvent.keyboard('{Escape}')
  },
}
