import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { userEvent, within } from 'storybook/test'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type { InvoiceRow } from '@/lib/sponsor-crm/invoice'
import { SponsorInvoiceTable } from './SponsorInvoiceTable'

const row = (
  id: string,
  sponsorName: string,
  invoiceStatus: InvoiceRow['invoiceStatus'],
  extra: Partial<InvoiceRow> = {},
): InvoiceRow => ({
  sponsorForConferenceId: id,
  sponsorName,
  orgNumber: '912 345 678',
  amount: 50000,
  currency: 'NOK',
  amountFromTier: false,
  tierTitle: 'Ingress',
  addonTitles: [],
  billingEmail: 'billing@example.com',
  invoiceFormat: 'EHF',
  invoiceStatus,
  readiness: { ready: true, blockers: [] },
  ...extra,
})

const meta = {
  title: 'Systems/Sponsors/Admin/SponsorInvoiceTable',
  component: SponsorInvoiceTable,
  decorators: [
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
  args: {
    rows: [
      row('sfc-1', 'Acme Cloud AS', 'not-sent'),
      row('sfc-2', 'Kube Corp Norge AS', 'sent', {
        invoiceSentAt: '2026-09-01',
        invoiceDueAt: '2026-09-15',
      }),
      row('sfc-3', 'Pod People', 'paid', { invoicePaidAt: '2026-08-20' }),
    ],
  },
} satisfies Meta<typeof SponsorInvoiceTable>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Two rows selected: the bulk bar shows its actions. */
export const BulkSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const name of ['Acme Cloud AS', 'Kube Corp Norge AS']) {
      const [box] = canvas
        .getAllByRole('checkbox', { name: `Select ${name} invoice` })
        .filter((el) => el.checkVisibility())
      await userEvent.click(box)
    }
  },
}
