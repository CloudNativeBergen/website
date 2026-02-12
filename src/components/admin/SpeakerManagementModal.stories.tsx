import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { XMarkIcon } from '@heroicons/react/24/outline'

const meta = {
  title: 'Systems/Speakers/Admin/SpeakerManagementModal',
  parameters: {
    layout: 'centered',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Modal for creating or editing speaker profiles. Features email input, SpeakerDetailsForm (name, bio, title, image upload, social links), and consent checkboxes. Uses tRPC mutations for create/update/updateEmail operations.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function MockSpeakerManagementModal({ mode }: { mode: 'create' | 'edit' }) {
  return (
    <div className="w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
      <div className="p-6">
        <div className="mb-6 flex items-start justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {mode === 'edit' ? 'Edit Speaker' : 'Create New Speaker'}
          </h2>
          <button className="text-gray-400 hover:text-gray-500">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email Address
            </label>
            <input
              type="email"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              defaultValue={mode === 'edit' ? 'jane.doe@example.com' : ''}
              placeholder="speaker@example.com"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              This email will be used to contact the speaker and for
              authentication.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Full Name
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              defaultValue={mode === 'edit' ? 'Jane Doe' : ''}
              placeholder="Full Name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Title / Company
            </label>
            <input
              type="text"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              defaultValue={
                mode === 'edit' ? 'Senior Engineer at CloudCorp' : ''
              }
              placeholder="Title at Company"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Bio
            </label>
            <textarea
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              defaultValue={
                mode === 'edit'
                  ? 'Jane Doe is a Senior Engineer at CloudCorp with over 10 years of experience in distributed systems and cloud native technologies.'
                  : ''
              }
              placeholder="Speaker bio..."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Profile Image
            </label>
            <div className="flex items-center gap-4">
              {mode === 'edit' ? (
                <div className="h-16 w-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                  <div className="flex h-full w-full items-center justify-center text-xl font-medium text-indigo-600 dark:text-indigo-400">
                    JD
                  </div>
                </div>
              ) : (
                <div className="h-16 w-16 rounded-full bg-gray-200 dark:bg-gray-600" />
              )}
              <button
                type="button"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Upload Image
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                defaultChecked={mode === 'edit'}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                I consent to data processing
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                defaultChecked={mode === 'edit'}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                I consent to a public profile
              </span>
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-6 dark:border-gray-700">
          <button className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {mode === 'edit' ? 'Update Speaker' : 'Create Speaker'}
          </button>
        </div>
      </div>
    </div>
  )
}

export const CreateNew: Story = {
  render: () => <MockSpeakerManagementModal mode="create" />,
  parameters: {
    docs: {
      description: {
        story:
          'Create mode with empty form fields. Uses `api.speaker.admin.create` mutation on submit.',
      },
    },
  },
}

export const EditExisting: Story = {
  render: () => <MockSpeakerManagementModal mode="edit" />,
  parameters: {
    docs: {
      description: {
        story:
          'Edit mode with pre-populated fields from the speaker profile. Uses `api.speaker.admin.update` and optionally `api.speaker.admin.updateEmail` mutations.',
      },
    },
  },
}
