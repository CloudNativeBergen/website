import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SponsorBulkActions } from './SponsorBulkActions'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { http, HttpResponse } from 'msw'

const meta: Meta<typeof SponsorBulkActions> = {
  title: 'Admin/Sponsors/Pipeline/SponsorBulkActions',
  component: SponsorBulkActions,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <NotificationProvider>
        <div className="relative h-96 bg-gray-50 p-8 dark:bg-gray-900">
          <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              The bulk actions toolbar appears at the bottom of the screen when
              sponsors are selected
            </p>
          </div>
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component:
          'Toolbar for performing bulk operations on selected sponsors. Appears when one or more sponsors are selected in the CRM interface. Allows batch updates to status, assignment, tags, and deletion. Uses Fresh Green (#10B981) for action buttons following the brand system.',
      },
    },
    msw: {
      handlers: [
        http.get('/api/trpc/sponsor.crm.listOrganizers', () => {
          return HttpResponse.json({
            result: {
              data: [
                { _id: 'org-1', name: 'John Doe', email: 'john@example.com' },
                {
                  _id: 'org-2',
                  name: 'Jane Smith',
                  email: 'jane@example.com',
                },
                {
                  _id: 'org-3',
                  name: 'Bob Johnson',
                  email: 'bob@example.com',
                },
              ],
            },
          })
        }),
      ],
    },
  },
}

export default meta
type Story = StoryObj<typeof SponsorBulkActions>

export const Interactive: Story = {
  args: {
    selectedIds: ['sfc-123', 'sfc-456', 'sfc-789'],
    onClearSelection: () => console.log('Clear selection'),
    onSuccess: () => console.log('Success'),
  },
}

export const SingleSelected: Story = {
  args: {
    selectedIds: ['sfc-123'],
    onClearSelection: () => console.log('Clear'),
    onSuccess: () => console.log('Success'),
  },
}

export const MultipleSelected: Story = {
  args: {
    selectedIds: ['sfc-123', 'sfc-456', 'sfc-789'],
    onClearSelection: () => console.log('Clear'),
    onSuccess: () => console.log('Success'),
  },
}

export const ManySelected: Story = {
  args: {
    selectedIds: Array.from({ length: 15 }, (_, i) => `sfc-${i + 1}`),
    onClearSelection: () => console.log('Clear'),
    onSuccess: () => console.log('Success'),
  },
}
