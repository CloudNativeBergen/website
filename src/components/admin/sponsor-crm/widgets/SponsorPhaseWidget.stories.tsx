import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { SponsorPhaseWidget } from './SponsorPhaseWidget'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type {
  SponsorActivityExpanded,
  SponsorForConferenceExpanded,
} from '@/lib/sponsor-crm/types'

const base = {
  _id: 'sfc-1',
  _createdAt: '2026-01-01T09:00:00Z',
  _updatedAt: '2026-10-20T09:00:00Z',
  sponsor: { _id: 's-1', name: 'Acme Cloud' },
  conference: { _id: 'c-1', title: 'Cloud Native Day' },
  tier: { _id: 't-1', title: 'Gold' },
  status: 'prospect',
  contractStatus: 'none',
  invoiceStatus: 'not-sent',
  contractValue: 50000,
  contractCurrency: 'NOK',
  contactPersons: [
    { _key: 'c1', name: 'Ada', email: 'ada@acme.test', isPrimary: true },
  ],
} as unknown as SponsorForConferenceExpanded

const owner = { _id: 'o-1', name: 'Kari Nordmann' }

const stage = (newValue: string, createdAt: string) =>
  ({
    _id: `a-${newValue}`,
    activityType: 'stage_change',
    createdAt,
    metadata: { newValue },
  }) as SponsorActivityExpanded

const meta = {
  title: 'Systems/Sponsors/Admin/Pipeline/SponsorPhaseWidget',
  component: SponsorPhaseWidget,
  decorators: [
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
  args: { sponsor: base, onOpenRecord: fn(), onChanged: fn() },
} satisfies Meta<typeof SponsorPhaseWidget>

export default meta
type Story = StoryObj<typeof meta>

export const ProspectNoOwner: Story = {}

export const Negotiating: Story = {
  args: {
    sponsor: {
      ...base,
      status: 'negotiating',
      assignedTo: owner,
      contactInitiatedAt: '2026-09-01T10:00:00Z',
      nextFollowUpAt: '2026-11-05T09:00:00Z',
    } as SponsorForConferenceExpanded,
  },
}

export const WonAwaitingSignature: Story = {
  args: {
    sponsor: {
      ...base,
      status: 'closed-won',
      contractStatus: 'contract-sent',
      assignedTo: owner,
      contactInitiatedAt: '2026-09-01T10:00:00Z',
      registrationComplete: true,
      registrationCompletedAt: '2026-09-20T10:00:00Z',
      contractSentAt: '2026-09-22T10:00:00Z',
      nextFollowUpAt: '2026-10-01T09:00:00Z',
    } as SponsorForConferenceExpanded,
    activities: [stage('closed-won', '2026-09-15T10:00:00Z')],
  },
}

export const Paid: Story = {
  args: {
    sponsor: {
      ...base,
      status: 'closed-won',
      contractStatus: 'contract-signed',
      invoiceStatus: 'paid',
      assignedTo: owner,
      contactInitiatedAt: '2026-06-01T10:00:00Z',
      registrationComplete: true,
      registrationCompletedAt: '2026-06-20T10:00:00Z',
      contractSentAt: '2026-06-22T10:00:00Z',
      contractSignedAt: '2026-06-25T10:00:00Z',
      invoiceSentAt: '2026-07-01T10:00:00Z',
      invoicePaidAt: '2026-07-20T10:00:00Z',
    } as SponsorForConferenceExpanded,
    activities: [stage('closed-won', '2026-06-15T10:00:00Z')],
  },
}

export const Lost: Story = {
  args: {
    sponsor: {
      ...base,
      status: 'closed-lost',
      assignedTo: owner,
      contactInitiatedAt: '2026-08-01T10:00:00Z',
    } as SponsorForConferenceExpanded,
    activities: [stage('closed-lost', '2026-08-30T10:00:00Z')],
  },
}
