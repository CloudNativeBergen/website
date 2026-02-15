import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import {
  RectangleStackIcon,
  ArrowDownOnSquareIcon,
} from '@heroicons/react/24/outline'
import { PlusIcon } from '@heroicons/react/20/solid'

const meta = {
  title: 'Systems/Sponsors/Admin/Pipeline/SponsorCRMPage',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Page wrapper for the sponsor CRM pipeline. Renders AdminPageHeader with Import Historic and New Sponsor action buttons above the full-height SponsorCRMPipeline board. Uses tRPC for data fetching.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AdminPageHeader
          icon={<RectangleStackIcon />}
          title="Sponsor Pipeline"
          description={
            <span>
              Manage relationships for{' '}
              <span className="font-medium text-brand-cloud-blue dark:text-blue-300">
                Cloud Native Days Norway 2026
              </span>
            </span>
          }
          actionItems={[
            {
              label: 'Import Historic',
              render: () => (
                <button className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">
                  <ArrowDownOnSquareIcon className="h-4 w-4" />
                  Import Historic
                </button>
              ),
            },
            {
              label: 'New Sponsor',
              onClick: () => {},
              icon: <PlusIcon className="-ml-0.5 h-5 w-5" aria-hidden="true" />,
            },
          ]}
          backLink={{ href: '#', label: 'Back' }}
        />

        {/* Pipeline placeholder */}
        <div className="mt-6 flex h-[60vh] items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900">
          <div className="text-center">
            <RectangleStackIcon className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              SponsorCRMPipeline renders here
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              See Pipeline stories for the full board experience
            </p>
          </div>
        </div>
      </div>
    </div>
  ),
}
