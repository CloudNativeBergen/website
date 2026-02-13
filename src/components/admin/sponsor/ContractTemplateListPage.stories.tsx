import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse, delay } from 'msw'
import { ContractTemplateListPage } from './ContractTemplateListPage'
import type { Conference } from '@/lib/conference/types'

const mockConference = {
  _id: 'conf-2026',
  title: 'Cloud Native Day Bergen 2026',
  slug: 'cloud-native-day-bergen-2026',
  startDate: '2026-11-05',
  endDate: '2026-11-05',
  city: 'Bergen',
  isActive: true,
} as unknown as Conference

const mockTemplates = [
  {
    _id: 'tpl-1',
    title: 'Standard Sponsor Agreement 2026',
    language: 'nb' as const,
    isDefault: true,
    isActive: true,
    tier: { _id: 'tier-1', title: 'Gold' },
    conference: { _ref: 'conf-2026' },
    sections: [],
  },
  {
    _id: 'tpl-2',
    title: 'English Sponsor Agreement',
    language: 'en' as const,
    isDefault: false,
    isActive: true,
    tier: null,
    conference: { _ref: 'conf-2026' },
    sections: [],
  },
  {
    _id: 'tpl-3',
    title: 'Community Tier Contract (Draft)',
    language: 'nb' as const,
    isDefault: false,
    isActive: false,
    tier: { _id: 'tier-3', title: 'Community' },
    conference: { _ref: 'conf-2026' },
    sections: [],
  },
]

const meta: Meta<typeof ContractTemplateListPage> = {
  title: 'Systems/Sponsors/Admin/Contracts/ContractTemplateListPage',
  component: ContractTemplateListPage,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Admin page listing all contract templates for a conference. Supports creating, editing, and deleting templates. Shows template language, associated tier, default/active status, and action buttons.',
      },
    },
    layout: 'padded',
    nextjs: { appDirectory: true },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-5xl">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ContractTemplateListPage>

/** Default view with multiple templates. */
export const Default: Story = {
  args: {
    conference: mockConference,
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/sponsor.contractTemplates.list', async () => {
          await delay(200)
          return HttpResponse.json({
            result: { data: mockTemplates },
          })
        }),
      ],
    },
  },
}

/** Empty state when no templates exist yet. */
export const EmptyState: Story = {
  args: {
    conference: mockConference,
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/sponsor.contractTemplates.list', async () => {
          await delay(200)
          return HttpResponse.json({
            result: { data: [] },
          })
        }),
      ],
    },
  },
}

/** Loading state while fetching templates. */
export const Loading: Story = {
  args: {
    conference: mockConference,
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/sponsor.contractTemplates.list', async () => {
          await delay(60000)
          return HttpResponse.json({
            result: { data: [] },
          })
        }),
      ],
    },
  },
}
