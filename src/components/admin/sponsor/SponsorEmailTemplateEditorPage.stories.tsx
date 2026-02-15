import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { EnvelopeIcon } from '@heroicons/react/24/outline'

const meta = {
  title: 'Systems/Sponsors/Admin/Email/SponsorEmailTemplateEditorPage',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Page wrapper that fetches a template by ID via tRPC and renders SponsorEmailTemplateEditor. Shows loading skeletons while fetching. See the SponsorEmailTemplateEditor story for the full editor UI.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Loading: Story = {
  name: 'Loading State',
  render: () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <AdminPageHeader
          icon={<EnvelopeIcon />}
          title="Edit Template"
          description="Loading template..."
          backLink={{ href: '#', label: 'Back to Templates' }}
        />
        <div className="mt-8 space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
            />
          ))}
        </div>
      </div>
    </div>
  ),
}

export const NewTemplate: Story = {
  name: 'New Template (Header Only)',
  render: () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <AdminPageHeader
          icon={<EnvelopeIcon />}
          title="New Template"
          description="Create a new outreach template for"
          contextHighlight="Cloud Native Days Norway 2026"
          backLink={{ href: '#', label: 'Back to Templates' }}
        />

        <div className="mt-8 flex h-[40vh] items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900">
          <div className="text-center">
            <EnvelopeIcon className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              SponsorEmailTemplateEditor renders here
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              See the SponsorEmailTemplateEditor story for the full editor
            </p>
          </div>
        </div>
      </div>
    </div>
  ),
}
