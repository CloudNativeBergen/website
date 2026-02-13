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
  terms: [
    {
      _type: 'block',
      _key: 'terms-h1',
      style: 'h2',
      children: [
        {
          _type: 'span',
          _key: 'th1',
          text: '1. Definitions',
          marks: [],
        },
      ],
      markDefs: [],
    },
    {
      _type: 'block',
      _key: 'terms-p1',
      style: 'normal',
      children: [
        {
          _type: 'span',
          _key: 'tp1a',
          text: '"Conference"',
          marks: ['strong'],
        },
        {
          _type: 'span',
          _key: 'tp1b',
          text: ' refers to {{{CONFERENCE_TITLE}}} taking place on {{{CONFERENCE_DATES}}} in {{{CONFERENCE_CITY}}}. ',
          marks: [],
        },
        {
          _type: 'span',
          _key: 'tp1c',
          text: '"Sponsor"',
          marks: ['strong'],
        },
        {
          _type: 'span',
          _key: 'tp1d',
          text: ' refers to {{{SPONSOR_NAME}}} (org.nr {{{SPONSOR_ORG_NUMBER}}}). ',
          marks: [],
        },
        {
          _type: 'span',
          _key: 'tp1e',
          text: '"Organizer"',
          marks: ['strong'],
        },
        {
          _type: 'span',
          _key: 'tp1f',
          text: ' refers to {{{ORG_NAME}}} (org.nr {{{ORG_ORG_NUMBER}}}).',
          marks: [],
        },
      ],
      markDefs: [],
    },
    {
      _type: 'block',
      _key: 'terms-h2',
      style: 'h2',
      children: [
        {
          _type: 'span',
          _key: 'th2',
          text: '2. Payment Terms',
          marks: [],
        },
      ],
      markDefs: [],
    },
    {
      _type: 'block',
      _key: 'terms-p2',
      style: 'normal',
      children: [
        {
          _type: 'span',
          _key: 'tp2',
          text: 'The Sponsor shall pay the agreed sponsorship fee of {{{CONTRACT_VALUE}}} {{{CONTRACT_CURRENCY}}} within 30 days of signing the contract. All payments are non-refundable unless the Conference is cancelled by the Organizer.',
          marks: [],
        },
      ],
      markDefs: [],
    },
    {
      _type: 'block',
      _key: 'terms-h3',
      style: 'h2',
      children: [
        {
          _type: 'span',
          _key: 'th3',
          text: '3. Sponsor Benefits',
          marks: [],
        },
      ],
      markDefs: [],
    },
    {
      _type: 'block',
      _key: 'terms-p3',
      style: 'normal',
      children: [
        {
          _type: 'span',
          _key: 'tp3',
          text: 'The Organizer will provide the following benefits at the {{{TIER_NAME}}} sponsorship level:',
          marks: [],
        },
      ],
      markDefs: [],
    },
    {
      _type: 'block',
      _key: 'terms-li1',
      style: 'normal',
      listItem: 'bullet',
      level: 1,
      children: [
        {
          _type: 'span',
          _key: 'tl1',
          text: 'Logo placement on the conference website and promotional materials',
          marks: [],
        },
      ],
      markDefs: [],
    },
    {
      _type: 'block',
      _key: 'terms-li2',
      style: 'normal',
      listItem: 'bullet',
      level: 1,
      children: [
        {
          _type: 'span',
          _key: 'tl2',
          text: 'Booth space at {{{VENUE_NAME}}} during the Conference',
          marks: [],
        },
      ],
      markDefs: [],
    },
    {
      _type: 'block',
      _key: 'terms-li3',
      style: 'normal',
      listItem: 'bullet',
      level: 1,
      children: [
        {
          _type: 'span',
          _key: 'tl3',
          text: 'Acknowledgement during opening and closing ceremonies',
          marks: [],
        },
      ],
      markDefs: [],
    },
    {
      _type: 'block',
      _key: 'terms-h4',
      style: 'h2',
      children: [
        {
          _type: 'span',
          _key: 'th4',
          text: '4. Cancellation Policy',
          marks: [],
        },
      ],
      markDefs: [],
    },
    {
      _type: 'block',
      _key: 'terms-p4',
      style: 'normal',
      children: [
        {
          _type: 'span',
          _key: 'tp4a',
          text: 'If the Sponsor wishes to cancel, a ',
          marks: [],
        },
        {
          _type: 'span',
          _key: 'tp4b',
          text: 'written notice',
          marks: ['strong'],
        },
        {
          _type: 'span',
          _key: 'tp4c',
          text: ' must be sent to {{{ORG_EMAIL}}} at least 60 days before the Conference start date. Cancellations received less than 60 days before the event will be charged the ',
          marks: [],
        },
        {
          _type: 'span',
          _key: 'tp4d',
          text: 'full sponsorship fee',
          marks: ['em'],
        },
        {
          _type: 'span',
          _key: 'tp4e',
          text: '.',
          marks: [],
        },
      ],
      markDefs: [],
    },
  ],
}

const tiersHandler = http.get(
  '/api/trpc/sponsor.tiers.listByConference',
  async () => {
    await delay(100)
    return HttpResponse.json({ result: { data: mockTiers } })
  },
)

const createHandler = http.post(
  '/api/trpc/sponsor.contractTemplates.create',
  async () => {
    await delay(200)
    return HttpResponse.json({
      result: { data: { _id: 'tpl-new', success: true } },
    })
  },
)

const updateHandler = http.post(
  '/api/trpc/sponsor.contractTemplates.update',
  async () => {
    await delay(200)
    return HttpResponse.json({ result: { data: { success: true } } })
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
      handlers: [tiersHandler, createHandler],
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
        updateHandler,
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
