import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, userEvent, within } from 'storybook/test'
import { mockExchangeRatesBeforeEach } from '@/lib/storybook/mockExchangeRates'
import { TravelSupportAdminPage } from './TravelSupportAdminPage'

// Renders the real page against msw-backed `travelSupport.admin.*` reads.
// Rows carry only the fields the list and stats read.

const trpc = (data: unknown) => HttpResponse.json({ result: { data } })
const at = (procedure: string) => `/api/trpc/travelSupport.admin.${procedure}`

const request = (
  _id: string,
  name: string,
  status: string,
  expenses: { amount: number; currency: string; status: string }[],
  approvedAmount?: number,
) => ({
  _id,
  status,
  approvedAmount,
  speaker: { _id: `sp-${_id}`, name, email: `${_id}@example.com` },
  conference: { _id: 'conf-1', name: 'Cloud Native Days Norway 2026' },
  bankingDetails: { preferredCurrency: 'NOK' },
  expenses: expenses.map((e, i) => ({ _id: `${_id}-e${i}`, ...e })),
})

const requests = [
  request('ts-1', 'Kari Nordmann', 'submitted', [
    { amount: 4200, currency: 'NOK', status: 'pending' },
    { amount: 180, currency: 'EUR', status: 'pending' },
  ]),
  request('ts-2', 'Ola Hansen', 'submitted', [
    { amount: 2950, currency: 'NOK', status: 'pending' },
  ]),
  request(
    'ts-3',
    'Alexandra Konstantinopoulou',
    'approved',
    [{ amount: 650, currency: 'USD', status: 'approved' }],
    6800,
  ),
  request(
    'ts-4',
    'Lars Eriksen',
    'paid',
    [{ amount: 3100, currency: 'NOK', status: 'approved' }],
    3100,
  ),
  request('ts-5', 'Draft Person', 'draft', []),
]

const meta = {
  title: 'Systems/TravelSupport/Admin/TravelSupportAdminPage',
  component: TravelSupportAdminPage,
  beforeEach: mockExchangeRatesBeforeEach(),
  parameters: {
    layout: 'padded',
    options: { showPanel: false },
    msw: {
      handlers: [
        http.get(at('list'), () => trpc(requests)),
        http.get(at('getSpeakersRequiringSupport'), () =>
          trpc([
            {
              _id: 'sp-x',
              name: 'Ingrid Berg',
              email: 'ingrid@example.com',
              hasSubmitted: false,
              confirmedTalks: [{ _id: 't1', title: 'eBPF in production' }],
            },
          ]),
        ),
      ],
    },
  },
} satisfies Meta<typeof TravelSupportAdminPage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** "Pending Review" stat pressed: the list narrows to submitted requests. */
export const PendingFilter: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: /Pending Review/ }),
    )
    await expect(
      await canvas.findByText(/Pending requests \(2\)/),
    ).toBeInTheDocument()
  },
}

const phone = { viewport: { defaultViewport: 'phone' } }

export const Phone: Story = { parameters: phone }

export const PendingFilterPhone: Story = {
  ...PendingFilter,
  parameters: phone,
}
