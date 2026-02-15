import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ModalShell } from './ModalShell'
import { fn } from 'storybook/test'

const meta: Meta<typeof ModalShell> = {
  title: 'Components/Feedback/ModalShell',
  component: ModalShell,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A shared modal wrapper providing consistent HeadlessUI Dialog + Transition boilerplate. Supply `isOpen`, `onClose`, `size`, and render children for your modal content.',
      },
    },
  },
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
