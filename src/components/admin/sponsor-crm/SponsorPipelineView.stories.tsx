import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { SponsorPipelineView } from './SponsorPipelineView'
import type { SponsorPipelineFormData } from './SponsorPipelineView'
import { mockSponsor, mockSponsorTier } from '@/__mocks__/sponsor-data'

const defaultFormData: SponsorPipelineFormData = {
  sponsorId: 'sponsor-123',
  name: 'Acme Corporation',
  website: 'https://acme.example.com',
  logo: '<svg>...</svg>',
  logoBright: null,
  orgNumber: '123456789',
  address: 'Tech Street 42, 5020 Bergen',
  tierId: 'tier-ingress',
  addonIds: [],
  contractStatus: 'verbal-agreement',
  status: 'negotiating',
  invoiceStatus: 'not-sent',
  contractValue: '100000',
  contractCurrency: 'NOK',
  notes: 'Very interested in premium package',
  tags: ['warm-lead', 'returning-sponsor'],
  assignedTo: 'org-1',
}

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
    _id: 'addon-workshop',
    title: 'Workshop Slot',
    tierType: 'addon',
    price: [{ _key: 'nok', amount: 25000, currency: 'NOK' }],
  }),
  mockSponsorTier({
    _id: 'addon-keynote',
    title: 'Keynote Intro',
    tierType: 'addon',
    price: [{ _key: 'nok', amount: 15000, currency: 'NOK' }],
  }),
]

const mockOrganizers = [
  {
    _id: 'org-1',
    name: 'Hans Kristian',
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

const meta = {
  title: 'Systems/Sponsors/Admin/Pipeline/SponsorPipelineView',
  component: SponsorPipelineView,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The pipeline form view shown inside the sponsor CRM modal. Allows editing all sponsor pipeline fields: status, tier, contract value, tags, notes, and assigned organizer. Uses individual form components (StatusListbox, TierRadioGroup, etc.) composed into a single form.',
      },
    },
  },
  args: {
    onSubmit: fn(),
    onCancel: fn(),
    onFormDataChange: fn(),
    onContractValueEdited: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SponsorPipelineView>

export default meta
type Story = StoryObj<typeof meta>

export const EditExisting: Story = {
  args: {
    formData: defaultFormData,
    sponsor: mockSponsor(),
    availableSponsors: [],
    regularTiers: mockTiers,
    addonTiers: mockAddonTiers,
    organizers: mockOrganizers,
    isPending: false,
  },
}

export const AddNew: Story = {
  args: {
    formData: {
      ...defaultFormData,
      sponsorId: '',
      name: '',
      website: '',
      orgNumber: '',
      address: '',
      tierId: '',
      addonIds: [],
      contractStatus: 'none',
      status: 'prospect',
      invoiceStatus: 'not-sent',
      contractValue: '',
      notes: '',
      tags: [],
      assignedTo: '',
    },
    sponsor: null,
    availableSponsors: [
      {
        _id: 'sp-1',
        name: 'TechCorp AS',
        website: 'https://techcorp.no',
      },
      {
        _id: 'sp-2',
        name: 'CloudSoft Solutions',
        website: 'https://cloudsoft.io',
      },
      {
        _id: 'sp-3',
        name: 'Nordic Dev Tools',
        website: 'https://nordicdev.com',
      },
    ],
    regularTiers: mockTiers,
    addonTiers: mockAddonTiers,
    organizers: mockOrganizers,
    isPending: false,
  },
}

export const Saving: Story = {
  args: {
    formData: defaultFormData,
    sponsor: mockSponsor(),
    availableSponsors: [],
    regularTiers: mockTiers,
    addonTiers: mockAddonTiers,
    organizers: mockOrganizers,
    isPending: true,
  },
}

export const WithAddons: Story = {
  args: {
    formData: {
      ...defaultFormData,
      addonIds: ['addon-workshop'],
    },
    sponsor: mockSponsor(),
    availableSponsors: [],
    regularTiers: mockTiers,
    addonTiers: mockAddonTiers,
    organizers: mockOrganizers,
    isPending: false,
  },
}

export const ClosedWon: Story = {
  args: {
    formData: {
      ...defaultFormData,
      status: 'closed-won',
      contractStatus: 'contract-signed',
      invoiceStatus: 'sent',
    },
    sponsor: mockSponsor({ status: 'closed-won' }),
    availableSponsors: [],
    regularTiers: mockTiers,
    addonTiers: mockAddonTiers,
    organizers: mockOrganizers,
    isPending: false,
  },
}
