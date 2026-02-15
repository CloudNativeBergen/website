import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { SponsorEmailTemplateEditor } from './SponsorEmailTemplateEditor'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { fn } from 'storybook/test'
import type { SponsorEmailTemplate } from '@/lib/sponsor/types'
import type { Conference } from '@/lib/conference/types'

const mockConference: Conference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2025',
  organizer: 'Cloud Native Days Norway',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2025-09-15',
  endDate: '2025-09-15',
  cfpStartDate: '2025-01-01',
  cfpEndDate: '2025-03-01',
  cfpNotifyDate: '2025-04-01',
  cfpEmail: 'cfp@cloudnativedays.no',
  sponsorEmail: 'sponsor@cloudnativedays.no',
  contactEmail: 'contact@cloudnativedays.no',
  programDate: '2025-09-15',
  registrationEnabled: true,
  domains: ['cloudnativedays.no'],
  formats: [],
  topics: [],
  organizers: [],
  sponsors: [],
  sponsorshipCustomization: {
    prospectusUrl: 'https://cloudnativedays.no/sponsors',
  },
}

const mockExistingTemplate: SponsorEmailTemplate = {
  _id: 'template-1',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  title: 'Initial Outreach (English)',
  slug: { current: 'initial-outreach-english' },
  description: 'First contact with potential sponsors',
  subject: 'Partnership Opportunity - {{{CONFERENCE_TITLE}}}',
  body: [
    {
      _key: 'p1',
      _type: 'block',
      children: [
        {
          _key: 's1',
          _type: 'span',
          text: 'Dear {{{CONTACT_NAMES}}},',
        },
      ],
      markDefs: [],
      style: 'normal',
    },
    {
      _key: 'p2',
      _type: 'block',
      children: [
        {
          _key: 's1',
          _type: 'span',
          text: 'We are excited to invite {{{SPONSOR_NAME}}} to partner with us at {{{CONFERENCE_TITLE}}} in {{{CONFERENCE_CITY}}}.',
        },
      ],
      markDefs: [],
      style: 'normal',
    },
    {
      _key: 'p3',
      _type: 'block',
      children: [
        {
          _key: 's1',
          _type: 'span',
          text: 'Best regards,',
        },
      ],
      markDefs: [],
      style: 'normal',
    },
    {
      _key: 'p4',
      _type: 'block',
      children: [
        {
          _key: 's1',
          _type: 'span',
          text: '{{{SENDER_NAME}}}',
        },
      ],
      markDefs: [],
      style: 'normal',
    },
  ],
  category: 'cold-outreach',
  language: 'en',
}

const createMswHandlers = () => [
  // Handle create mutation
  http.post('/api/trpc/sponsor.emailTemplates.create', async () => {
    return HttpResponse.json({
      result: {
        data: { _id: 'template-new', success: true },
      },
    })
  }),
  // Handle update mutation
  http.post('/api/trpc/sponsor.emailTemplates.update', async () => {
    return HttpResponse.json({
      result: {
        data: { success: true },
      },
    })
  }),
  // Handle list query (for cache invalidation)
  http.get('/api/trpc/sponsor.emailTemplates.list', () => {
    return HttpResponse.json({
      result: {
        data: [mockExistingTemplate],
      },
    })
  }),
]

const meta = {
  title: 'Systems/Sponsors/Admin/Email/SponsorEmailTemplateEditor',
  component: SponsorEmailTemplateEditor,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Two-column editor for creating and editing sponsor email templates. Features a rich text editor with template variable support and live preview. Supports categories (cold-outreach, follow-up, contract, post-event) and languages (Norwegian, English). Variables like {{{SPONSOR_NAME}}}, {{{CONFERENCE_TITLE}}} are resolved in the preview panel.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <NotificationProvider>
        <div className="max-w-7xl p-6">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
} satisfies Meta<typeof SponsorEmailTemplateEditor>

export default meta
type Story = StoryObj<typeof meta>

export const CreateNew: Story = {
  args: {
    conference: mockConference,
    onSaved: fn(),
  },
  parameters: {
    msw: {
      handlers: createMswHandlers(),
    },
  },
}

export const EditExisting: Story = {
  args: {
    conference: mockConference,
    template: mockExistingTemplate,
    onSaved: fn(),
  },
  parameters: {
    msw: {
      handlers: createMswHandlers(),
    },
  },
}
