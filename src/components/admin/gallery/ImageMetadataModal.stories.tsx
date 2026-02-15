import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { XMarkIcon, ChevronUpDownIcon } from '@heroicons/react/24/outline'

const meta = {
  title: 'Systems/Proposals/Admin/Gallery/ImageMetadataModal',
  parameters: {
    layout: 'centered',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Modal for editing image metadata including photographer, date, time, location, alt text, speaker tags, hotspot/crop editing, and featured toggle. Supports both single-image and bulk-edit modes. Uses `api.speakers.search` for speaker search and `api.gallery.update` for saving. Includes speaker notification checkbox and ⌘S keyboard shortcut.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const taggedSpeakers = [
  { _id: 'sp-1', name: 'Jane Doe', slug: 'jane-doe' },
  { _id: 'sp-2', name: 'John Smith', slug: 'john-smith' },
]

function MockImageMetadataModal({ mode }: { mode: 'single' | 'bulk' }) {
  return (
    <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {mode === 'bulk' ? 'Bulk Update 5 Images' : 'Edit Image Metadata'}
        </h3>
        <button className="rounded-md text-gray-400 hover:text-gray-500 dark:text-gray-300">
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {/* Image hotspot preview (single mode only) */}
        {mode === 'single' && (
          <div className="relative overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-700">
            <div className="flex h-48 items-center justify-center text-gray-400">
              Image with hotspot editor
            </div>
          </div>
        )}

        {/* Form fields */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white">
              Photographer{mode === 'bulk' ? ' (optional)' : ''}
            </label>
            <input
              type="text"
              defaultValue={mode === 'single' ? 'Olav Nordmann' : ''}
              placeholder={
                mode === 'bulk' ? 'Leave empty to keep existing' : ''
              }
              className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              readOnly
            />
          </div>

          {mode === 'single' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Date
                </label>
                <input
                  type="date"
                  defaultValue="2025-06-12"
                  className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-white">
                  Time
                </label>
                <input
                  type="time"
                  defaultValue="14:30"
                  className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  readOnly
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white">
              Location{mode === 'bulk' ? ' (optional)' : ''}
            </label>
            <input
              type="text"
              defaultValue={mode === 'single' ? 'Grieghallen, Bergen' : ''}
              placeholder={
                mode === 'bulk' ? 'Leave empty to keep existing' : ''
              }
              className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              readOnly
            />
          </div>

          {mode === 'single' && (
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white">
                Alt Text
              </label>
              <input
                type="text"
                defaultValue="Keynote presentation at Cloud Native Days"
                placeholder="Description for accessibility"
                className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                readOnly
              />
            </div>
          )}
        </div>

        {/* Speaker search */}
        <div>
          <label className="block text-sm font-medium text-gray-900 dark:text-white">
            {mode === 'bulk' ? 'Add Speakers' : 'Tag Speakers'}
          </label>
          <div className="relative mt-2">
            <input
              type="text"
              placeholder="Search for speakers..."
              className="w-full rounded-md border border-gray-300 py-1.5 pr-10 pl-3 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              readOnly
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
            </div>
          </div>

          {/* Tagged speakers */}
          <div className="mt-3 flex flex-wrap gap-2">
            {taggedSpeakers.map((speaker) => (
              <span
                key={speaker._id}
                className="inline-flex items-center gap-x-2 rounded-full bg-indigo-100 py-1 pr-2 pl-1 text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400"
              >
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-200 dark:bg-indigo-500/20">
                  <span className="text-[10px] font-medium">
                    {speaker.name.charAt(0)}
                  </span>
                </div>
                <span>{speaker.name}</span>
                <button className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-indigo-200">
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>

          {/* Notify checkbox */}
          <div className="mt-3">
            <label className="flex cursor-pointer items-center">
              <input
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Send email notification to{' '}
                {mode === 'bulk' ? 'tagged' : 'newly tagged'} speakers
              </span>
            </label>
          </div>
        </div>

        {/* Featured toggle (single mode only) */}
        {mode === 'single' && (
          <label className="flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-indigo-600"
            />
            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Featured image
            </span>
          </label>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 pt-6">
        <button className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300">
          Cancel
        </button>
        <button className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500">
          {mode === 'bulk' ? 'Update Images' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

export const SingleImage: Story = {
  render: () => <MockImageMetadataModal mode="single" />,
  parameters: {
    docs: {
      description: {
        story:
          'Single image editing mode with all fields including hotspot editor, date/time, alt text, and featured toggle.',
      },
    },
  },
}

export const BulkEdit: Story = {
  render: () => <MockImageMetadataModal mode="bulk" />,
  parameters: {
    docs: {
      description: {
        story:
          'Bulk edit mode for multiple images. Only photographer, location, and speaker tags are available. Fields are optional — empty values preserve existing data.',
      },
    },
  },
}
