import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse, delay } from 'msw'
import { ContractTemplateEditorPage } from './ContractTemplateEditorPage'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
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

const mockTiers = [
  { _id: 'tier-1', title: 'Gold' },
  { _id: 'tier-2', title: 'Silver' },
  { _id: 'tier-3', title: 'Community' },
]

const mockExistingTemplate = {
  _id: 'tpl-1',
  title: 'Standard Sponsor Agreement 2026',
  language: 'nb',
  currency: 'NOK',
  isDefault: true,
  isActive: true,
  tier: { _id: 'tier-1', title: 'Gold' },
  headerText: 'Cloud Native Days Norway',
  footerText: 'Org.nr 123 456 789',
  sections: [
    {
      heading: '1. Parties',
      body: [
        {
          _type: 'block',
          _key: 'p-0',
          style: 'normal',
          children: [
            {
              _type: 'span',
              _key: 's-0',
              text: 'This agreement is between {{{ORGANIZER_NAME}}} and {{{SPONSOR_NAME}}}.',
              marks: [],
            },
          ],
          markDefs: [],
        },
      ],
    },
    {
      heading: '2. Sponsorship Package',
      body: [
        {
          _type: 'block',
          _key: 'p-1',
          style: 'normal',
          children: [
            {
              _type: 'span',
              _key: 's-1',
              text: '{{{SPONSOR_NAME}}} will sponsor at the {{{TIER_TITLE}}} level for {{{CONTRACT_VALUE}}} {{{CONTRACT_CURRENCY}}}.',
              marks: [],
            },
          ],
          markDefs: [],
        },
      ],
    },
    {
      heading: '3. Duration',
      body: [
        {
          _type: 'block',
          _key: 'p-2',
          style: 'normal',
          children: [
            {
              _type: 'span',
              _key: 's-2',
              text: 'The conference takes place {{{CONFERENCE_START_DATE}}} to {{{CONFERENCE_END_DATE}}} at {{{VENUE_NAME}}}.',
              marks: [],
            },
          ],
          markDefs: [],
        },
      ],
    },
  ],
  terms: [],
}

const tiersHandler = http.get(
  '/api/trpc/sponsor.tiers.listByConference',
  async () => {
    await delay(100)
    return HttpResponse.json({ result: { data: mockTiers } })
  },
)

const meta: Meta<typeof ContractTemplateEditorPage> = {
  title: 'Systems/Sponsors/Admin/Contracts/ContractTemplateEditorPage',
  component: ContractTemplateEditorPage,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Admin editor for creating and editing contract templates. Supports template settings (language, currency, tier, default/active flags), a collapsible variable reference, reorderable contract sections with heading and body, and general terms & conditions. Used for both "new" and "edit" modes.',
      },
    },
    layout: 'padded',
    nextjs: { appDirectory: true },
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <div className="mx-auto max-w-5xl">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ContractTemplateEditorPage>

/** Create mode — empty form for a new template. */
export const NewTemplate: Story = {
  args: {
    conference: mockConference,
  },
  parameters: {
    msw: {
      handlers: [tiersHandler],
    },
  },
}

/** Edit mode — pre-populated with an existing template. */
export const EditTemplate: Story = {
  args: {
    conference: mockConference,
    templateId: 'tpl-1',
  },
  parameters: {
    msw: {
      handlers: [
        tiersHandler,
        http.get('/api/trpc/sponsor.contractTemplates.get', async () => {
          await delay(200)
          return HttpResponse.json({
            result: { data: mockExistingTemplate },
          })
        }),
      ],
    },
  },
}

/** Loading state while fetching an existing template. */
export const LoadingTemplate: Story = {
  args: {
    conference: mockConference,
    templateId: 'tpl-1',
  },
  parameters: {
    msw: {
      handlers: [
        tiersHandler,
        http.get('/api/trpc/sponsor.contractTemplates.get', async () => {
          await delay(60000)
          return HttpResponse.json({
            result: { data: mockExistingTemplate },
          })
        }),
      ],
    },
  },
}
