import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ThemeProvider } from 'next-themes'
import { SponsorContactTable } from './SponsorContactTable'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import {
  mockSponsor,
  mockContactPerson,
  mockBillingInfo,
} from '@/__mocks__/sponsor-data'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'

// Renders the REAL SponsorContactTable (the previous story hand-rolled a
// look-alike table, so it could not catch regressions in the component). The
// fixtures below are chosen to exercise every billing state the page must
// report honestly.

const acme = mockSponsor({
  _id: 'sfc-acme',
  status: 'closed-won',
  sponsor: {
    ...mockSponsor().sponsor,
    name: 'Acme Corporation',
    orgNumber: '912345678',
  },
  // Primary is listed second on purpose — the table must still lead with it.
  contactPersons: [
    mockContactPerson({
      _key: 'c-acme-2',
      name: 'Chris Green',
      email: 'chris@acme.example',
      role: 'Event Coordinator',
      phone: undefined,
    }),
    mockContactPerson({
      _key: 'c-acme-1',
      name: 'Jane Smith',
      email: 'jane@acme.example',
      role: 'Marketing Manager',
      isPrimary: true,
    }),
  ],
  billing: mockBillingInfo({ invoiceFormat: 'ehf' }),
})

const missingOrgNumber = mockSponsor({
  _id: 'sfc-ehf-no-org',
  status: 'closed-won',
  sponsor: {
    ...mockSponsor().sponsor,
    _id: 'sponsor-nordic',
    name: 'Nordic Systems AS',
    orgNumber: undefined,
  },
  contactPersons: [
    mockContactPerson({
      _key: 'c-nordic',
      name: 'Bob Wilson',
      email: 'bob@nordic.example',
      role: 'CEO',
      isPrimary: true,
    }),
  ],
  // EHF is addressed by organisation number — this sponsor cannot be invoiced.
  billing: mockBillingInfo({ invoiceFormat: 'ehf', reference: undefined }),
})

const missingFormat = mockSponsor({
  _id: 'sfc-no-format',
  status: 'negotiating',
  sponsor: {
    ...mockSponsor().sponsor,
    _id: 'sponsor-cloudco',
    name: 'CloudCo',
  },
  contactPersons: [
    mockContactPerson({
      _key: 'c-cloudco',
      name: 'Alice Brown',
      email: 'alice@cloudco.example',
      role: 'Partnership Lead',
      isPrimary: true,
    }),
  ],
  billing: {
    ...mockBillingInfo({
      comments:
        'Send in the first week of the month. Reference the framework agreement and split the amount across both departments.',
    }),
    invoiceFormat: undefined as unknown as 'pdf',
  },
})

const noBilling = mockSponsor({
  _id: 'sfc-no-billing',
  status: 'closed-won',
  tier: undefined,
  sponsor: {
    ...mockSponsor().sponsor,
    _id: 'sponsor-tiny',
    name: 'Tiny Startup',
    orgNumber: undefined,
  },
  contactPersons: [],
  billing: undefined,
})

const sponsors: SponsorForConferenceExpanded[] = [
  acme,
  missingOrgNumber,
  missingFormat,
  noBilling,
]

const meta = {
  title: 'Systems/Sponsors/Admin/Contacts/SponsorContactTable',
  component: SponsorContactTable,
  tags: ['autodocs'],
  decorators: [
    // The edit dialog portals to document.body, outside the toolbar's `.dark`
    // wrapper. next-themes context crosses the portal, so force it (synced to
    // the Storybook theme global) for the dialog's dark QA.
    (Story, context) => (
      <ThemeProvider
        attribute="class"
        forcedTheme={context.globals.theme === 'dark' ? 'dark' : 'light'}
      >
        <NotificationProvider>
          <Story />
        </NotificationProvider>
      </ThemeProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
    docs: {
      description: {
        component:
          'Contact rows for each sponsor, one line per contact person. Billing is rendered exactly as recorded: a missing invoice format is called out rather than defaulting to PDF, and an EHF sponsor without an organisation number is flagged as un-invoiceable.',
      },
    },
  },
} satisfies Meta<typeof SponsorContactTable>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { sponsors },
}

/** Every billing gap the page can report, side by side. */
export const BillingGaps: Story = {
  args: { sponsors: [missingOrgNumber, missingFormat, noBilling] },
}

export const Empty: Story = {
  args: {
    sponsors: [],
    emptyDescription:
      'No sponsors match the current filters. Try widening the stage or billing filter.',
  },
}
