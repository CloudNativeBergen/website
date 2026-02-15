import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { fn } from 'storybook/test'
import { SponsorTemplatePicker } from './SponsorTemplatePicker'

const mockTemplates = [
  {
    _id: 'template-1',
    title: 'Initial Outreach',
    description: 'First contact with potential sponsors',
    subject: 'Partnership Opportunity - {{{CONFERENCE_NAME}}}',
    body: [
      {
        _key: 'p1',
        _type: 'block',
        children: [
          {
            _key: 's1',
            _type: 'span',
            text: 'Dear {{{CONTACT_NAME}}}, We are excited to invite {{{SPONSOR_NAME}}} to partner with us...',
          },
        ],
        markDefs: [],
        style: 'normal',
      },
    ],
    category: 'outreach',
    language: 'en',
    isActive: true,
  },
  {
    _id: 'template-2',
    title: 'Avtaleforslag',
    description: 'Norsk oppfølgingsmal',
    subject: 'Oppfølging - {{{CONFERENCE_NAME}}} sponsoravtale',
    body: [
      {
        _key: 'p1',
        _type: 'block',
        children: [
          {
            _key: 's1',
            _type: 'span',
            text: 'Hei {{{CONTACT_NAME}}}, Takk for interessen...',
          },
        ],
        markDefs: [],
        style: 'normal',
      },
    ],
    category: 'outreach',
    language: 'no',
    isActive: true,
  },
  {
    _id: 'template-3',
    title: 'Contract Follow-up',
    description: 'Follow up on pending contract',
    subject: 'Contract Status - {{{CONFERENCE_NAME}}}',
    body: [
      {
        _key: 'p1',
        _type: 'block',
        children: [
          {
            _key: 's1',
            _type: 'span',
            text: 'Hi {{{CONTACT_NAME}}}, We wanted to follow up on the contract...',
          },
        ],
        markDefs: [],
        style: 'normal',
      },
    ],
    category: 'contract',
    language: 'en',
    isActive: true,
  },
  {
    _id: 'template-4',
    title: 'Thank You',
    description: 'Thank sponsor after event',
    subject: 'Thank You for Supporting {{{CONFERENCE_NAME}}}',
    body: [
      {
        _key: 'p1',
        _type: 'block',
        children: [
          {
            _key: 's1',
            _type: 'span',
            text: 'Dear {{{CONTACT_NAME}}}, Thank you for your support...',
          },
        ],
        markDefs: [],
        style: 'normal',
      },
    ],
    category: 'post_event',
    language: 'en',
    isActive: true,
  },
]

const mockConference = {
  title: 'Cloud Native Days Norway 2025',
  city: 'Bergen',
  startDate: '2025-09-15',
  organizer: 'Cloud Native Days Norway',
  domains: ['cloudnativedays.no'],
  prospectusUrl: 'https://cloudnativedays.no/sponsors',
}

const meta = {
  title: 'Systems/Sponsors/Admin/Email/SponsorTemplatePicker',
  component: SponsorTemplatePicker,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Dropdown for selecting and applying email templates. Fetches templates from tRPC API and groups them by category. Supports template variable substitution with sponsor and conference data. Shows language flags and recommended templates based on CRM context.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SponsorTemplatePicker>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    sponsorName: 'Acme Corporation',
    contactNames: 'John Doe',
    conference: mockConference,
    senderName: 'Hans Kristian',
    tierName: 'Gold',
    onApply: fn(),
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/sponsor.emailTemplates.list', () => {
          return HttpResponse.json({
            result: {
              data: mockTemplates,
            },
          })
        }),
      ],
    },
  },
}

export const WithCRMContext: Story = {
  args: {
    sponsorName: 'Equinor',
    contactNames: 'Lisa Hansen',
    conference: mockConference,
    senderName: 'Hans Kristian',
    tierName: 'Platinum',
    onApply: fn(),
    crmContext: {
      tags: ['norwegian', 'large-enterprise'],
      status: 'negotiating',
      currency: 'NOK',
      orgNumber: '923609016',
      website: 'https://equinor.com',
    },
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/sponsor.emailTemplates.list', () => {
          return HttpResponse.json({
            result: {
              data: mockTemplates,
            },
          })
        }),
      ],
    },
  },
}

export const Loading: Story = {
  args: {
    sponsorName: 'Loading Corp',
    contactNames: 'Test User',
    conference: mockConference,
    onApply: fn(),
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/sponsor.emailTemplates.list', async () => {
          await new Promise((resolve) => setTimeout(resolve, 30000))
          return HttpResponse.json({
            result: {
              data: mockTemplates,
            },
          })
        }),
      ],
    },
  },
}

export const NoTemplates: Story = {
  args: {
    sponsorName: 'Empty Corp',
    contactNames: 'Test User',
    conference: mockConference,
    onApply: fn(),
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/sponsor.emailTemplates.list', () => {
          return HttpResponse.json({
            result: {
              data: [],
            },
          })
        }),
      ],
    },
  },
}

export const SingleCategory: Story = {
  args: {
    sponsorName: 'Test Corp',
    contactNames: 'Test User',
    conference: mockConference,
    onApply: fn(),
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/sponsor.emailTemplates.list', () => {
          return HttpResponse.json({
            result: {
              data: mockTemplates.filter((t) => t.category === 'outreach'),
            },
          })
        }),
      ],
    },
  },
}
