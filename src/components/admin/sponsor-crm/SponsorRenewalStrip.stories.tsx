import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { SponsorRenewalStripView } from './SponsorRenewalStrip'

const renewals = {
  edition: { _id: 'conf-2025', title: 'CNB 2025', origin: null, ended: true },
  candidates: [
    { _id: 'sfc-1', name: 'Acme Cloud', tierTitle: 'Ingress' },
    { _id: 'sfc-2', name: 'Kube Corp', tierTitle: 'Service' },
    { _id: 'sfc-3', name: 'Pod People', tierTitle: 'Pod' },
  ],
}

const meta = {
  title: 'Systems/Sponsors/Admin/Pipeline/SponsorRenewalStrip',
  component: SponsorRenewalStripView,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Strip above the CRM board listing last edition’s won sponsors with no deal this year. Renew copies the sponsor in as a prospect (first column) and removes the chip. Hidden when empty; collapsed state is kept in localStorage. Scrolls horizontally on phones.',
      },
    },
  },
  args: { renewals, onRenew: fn(async () => ({})) },
} satisfies Meta<typeof SponsorRenewalStripView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Renew Kube Corp' }),
    )
    await expect(args.onRenew).toHaveBeenCalledWith('sfc-2')
    await expect(
      canvas.queryByRole('button', { name: 'Renew Kube Corp' }),
    ).toBeNull()
  },
}

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}

export const RenewFails: Story = {
  args: {
    onRenew: fn(async () => {
      throw new Error('Could not renew Acme Cloud: sponsor already exists')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: 'Renew Acme Cloud' }),
    )
    await expect(await canvas.findByRole('alert')).toBeVisible()
  },
}
