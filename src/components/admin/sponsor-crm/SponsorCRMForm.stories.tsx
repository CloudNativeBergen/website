import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { SponsorCRMForm } from './SponsorCRMForm'
import {
  mockSponsor,
  mockSponsorTier,
  mockReadinessReady,
} from '@/__mocks__/sponsor-data'
import { NotificationProvider } from '@/components/admin/NotificationProvider'

const mockTiers = [
  mockSponsorTier({
    _id: 'tier-platinum',
    title: 'Platinum',
    price: [{ _key: 'nok', amount: 150000, currency: 'NOK' }],
  }),
  mockSponsorTier({
    _id: 'tier-ingress',
    title: 'Ingress',
    price: [{ _key: 'nok', amount: 100000, currency: 'NOK' }],
  }),
  mockSponsorTier({
    _id: 'tier-service',
    title: 'Service',
    price: [{ _key: 'nok', amount: 50000, currency: 'NOK' }],
  }),
]

const mockAddonTiers = [
  mockSponsorTier({
    _id: 'addon-speakers-dinner',
    title: 'Speakers Dinner',
    tierType: 'addon',
    price: [{ _key: 'nok', amount: 25000, currency: 'NOK' }],
  }),
  mockSponsorTier({
    _id: 'addon-lanyard',
    title: 'Lanyard Sponsorship',
    tierType: 'addon',
    price: [{ _key: 'nok', amount: 15000, currency: 'NOK' }],
  }),
]

const mockOrganizers = [
  {
    _id: 'org-1',
    name: 'Hans Kristian Flaatten',
    email: 'hans@example.com',
    avatar: null,
  },
  {
    _id: 'org-2',
    name: 'Maria Jensen',
    email: 'maria@example.com',
    avatar: null,
  },
]

const mockAllSponsors = [
  {
    _id: 'sponsor-123',
    name: 'Acme Corporation',
    website: 'https://acme.example.com',
    logo: null,
  },
  {
    _id: 'sponsor-456',
    name: 'TechGiant Corp',
    website: 'https://techgiant.com',
    logo: null,
  },
  {
    _id: 'sponsor-789',
    name: 'CloudSoft Solutions',
    website: 'https://cloudsoft.io',
    logo: null,
  },
]

const defaultHandlers = [
  http.get('/api/trpc/sponsor.list', () =>
    HttpResponse.json({ result: { data: mockAllSponsors } }),
  ),
  http.get('/api/trpc/sponsor.tiers.listByConference', () =>
    HttpResponse.json({
      result: { data: [...mockTiers, ...mockAddonTiers] },
    }),
  ),
  http.get('/api/trpc/sponsor.crm.listOrganizers', () =>
    HttpResponse.json({ result: { data: mockOrganizers } }),
  ),
  http.get('/api/trpc/sponsor.contractTemplates.contractReadiness', () =>
    HttpResponse.json({ result: { data: mockReadinessReady() } }),
  ),
  http.get('/api/trpc/sponsor.contractTemplates.findBest', () =>
    HttpResponse.json({
      result: {
        data: {
          _id: 'tmpl-1',
          title: 'Standard Sponsorship Agreement',
          language: 'en',
        },
      },
    }),
  ),
  http.post('/api/trpc/sponsor.crm.update', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
  http.post('/api/trpc/sponsor.crm.create', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
  http.post('/api/trpc/sponsor.update', () =>
    HttpResponse.json({ result: { data: { success: true } } }),
  ),
]

const meta = {
  title: 'Systems/Sponsors/Admin/Pipeline/SponsorCRMForm',
  component: SponsorCRMForm,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Modal dialog for managing sponsor pipeline entries. Contains tabbed views for Pipeline (main form), Contract (send & track agreements), Logo (upload/manage), Contacts (manage contact persons), and History (activity timeline). Keyboard shortcut CMD+S saves the pipeline form.',
      },
    },
    msw: { handlers: defaultHandlers },
  },
  args: {
    conferenceId: 'conf-2026',
    isOpen: true,
    onClose: fn(),
    onSuccess: fn(),
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
} satisfies Meta<typeof SponsorCRMForm>

export default meta
type Story = StoryObj<typeof meta>

const mockSponsorRef = {
  _id: 'sfc-123',
  sponsor: { _id: 'sponsor-123', name: 'Acme Corporation' },
}

const mockActivities = [
  {
    _id: 'act-1',
    _createdAt: '2026-02-10T14:30:00Z',
    _updatedAt: '2026-02-10T14:30:00Z',
    sponsorForConference: mockSponsorRef,
    activityType: 'stage_change',
    description: 'Status changed from contacted to negotiating',
    metadata: { oldValue: 'contacted', newValue: 'negotiating' },
    createdBy: {
      _id: 'org-1',
      name: 'Hans Kristian Flaatten',
      email: 'hans@example.com',
    },
    createdAt: '2026-02-10T14:30:00Z',
  },
  {
    _id: 'act-2',
    _createdAt: '2026-02-09T10:00:00Z',
    _updatedAt: '2026-02-09T10:00:00Z',
    sponsorForConference: mockSponsorRef,
    activityType: 'contract_status_change',
    description: 'Contract sent to sponsor',
    metadata: { oldValue: 'none', newValue: 'contract-sent' },
    createdBy: {
      _id: 'org-1',
      name: 'Hans Kristian Flaatten',
      email: 'hans@example.com',
    },
    createdAt: '2026-02-09T10:00:00Z',
  },
  {
    _id: 'act-3',
    _createdAt: '2026-02-08T09:15:00Z',
    _updatedAt: '2026-02-08T09:15:00Z',
    sponsorForConference: mockSponsorRef,
    activityType: 'email',
    description: 'Outreach email sent to sponsor contact',
    createdBy: {
      _id: 'org-2',
      name: 'Maria Jensen',
      email: 'maria@example.com',
    },
    createdAt: '2026-02-08T09:15:00Z',
  },
  {
    _id: 'act-4',
    _createdAt: '2026-02-05T16:45:00Z',
    _updatedAt: '2026-02-05T16:45:00Z',
    sponsorForConference: mockSponsorRef,
    activityType: 'note',
    description: 'Spoke with CTO at meetup, very interested in platinum tier',
    createdBy: {
      _id: 'org-2',
      name: 'Maria Jensen',
      email: 'maria@example.com',
    },
    createdAt: '2026-02-05T16:45:00Z',
  },
  {
    _id: 'act-5',
    _createdAt: '2026-02-01T11:00:00Z',
    _updatedAt: '2026-02-01T11:00:00Z',
    sponsorForConference: mockSponsorRef,
    activityType: 'stage_change',
    description: 'Status changed from prospect to contacted',
    metadata: { oldValue: 'prospect', newValue: 'contacted' },
    createdBy: {
      _id: 'org-1',
      name: 'Hans Kristian Flaatten',
      email: 'hans@example.com',
    },
    createdAt: '2026-02-01T11:00:00Z',
  },
]

/** Viewing an existing sponsor — opens on the Pipeline tab (default view) */
export const EditExisting: Story = {
  args: {
    sponsor: mockSponsor(),
  },
}

/** Adding a new sponsor to the pipeline */
export const AddNew: Story = {
  args: {
    sponsor: null,
    existingSponsorsInCRM: ['sponsor-123'],
  },
}

/** Contract view showing the contract management tab */
export const ContractView: Story = {
  args: {
    sponsor: mockSponsor({
      contractStatus: 'contract-sent',
      signatureStatus: 'pending',
      signatureId: 'agreement-123',
      contractSentAt: '2026-02-01T12:00:00Z',
    }),
    initialView: 'contract',
  },
}

/** History view showing the activity timeline with multiple activity types */
export const HistoryView: Story = {
  args: {
    sponsor: mockSponsor(),
    initialView: 'history',
  },
  parameters: {
    msw: {
      handlers: [
        ...defaultHandlers,
        http.get('/api/trpc/sponsor.crm.activities.list', () =>
          HttpResponse.json({ result: { data: mockActivities } }),
        ),
      ],
    },
  },
}

/** Logo view for uploading and managing sponsor logos */
export const LogoView: Story = {
  args: {
    sponsor: mockSponsor(),
    initialView: 'logo',
  },
}

/** Contacts view for managing sponsor contact persons */
export const ContactsView: Story = {
  args: {
    sponsor: mockSponsor(),
    initialView: 'contacts',
  },
}
