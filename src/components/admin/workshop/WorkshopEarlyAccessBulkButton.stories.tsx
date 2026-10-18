import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { WorkshopEarlyAccessBulkButton } from './WorkshopEarlyAccessBulkButton'
import { NotificationProvider } from '@/components/admin/NotificationProvider'

/**
 * "Send early access to sponsors" (#1347) under the workshop registration
 * card: confirmed in a dialog that says how many sponsors get it, then a
 * summary of who was sent, who was not and why, and how many are left.
 */
const PREVIEW = '/api/trpc/workshop.admin.earlyAccessBulkPreview'
const SEND = '/api/trpc/workshop.admin.sendEarlyAccessBulk'
const trpc = (data: unknown) => HttpResponse.json({ result: { data } })

const preview = (data: { count: number; refusal: string | null }) =>
  http.get(PREVIEW, () => trpc(data))
const sent = http.post(SEND, () =>
  trpc({
    sent: [
      { id: 'sfc-1', name: 'Acme AS' },
      { id: 'sfc-2', name: 'Globex' },
    ],
    skipped: [
      {
        id: 'sfc-3',
        name: 'Initech',
        reason: 'Choose at least one recipient with an email address.',
      },
    ],
    remaining: 4,
  }),
)

const meta = {
  title: 'Systems/Workshops/Admin/WorkshopEarlyAccessBulkButton',
  component: WorkshopEarlyAccessBulkButton,
  parameters: {
    msw: { handlers: [preview({ count: 7, refusal: null }), sent] },
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <div className="p-6">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
} satisfies Meta<typeof WorkshopEarlyAccessBulkButton>

export default meta
type Story = StoryObj<typeof meta>

const BUTTON = 'Send early access to sponsors'

/** The whole round: count in the dialog, then the summary with the rest. */
export const Available: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const button = await page.findByRole('button', { name: BUTTON })
    await waitFor(() => expect(button).toBeEnabled())
    await userEvent.click(button)
    await expect(
      await page.findByText(/^7 sponsors with a won deal/),
    ).toBeInTheDocument()
    await userEvent.click(page.getByRole('button', { name: 'Send' }))
    await expect(
      await page.findByText('Sent to 2 sponsors: Acme AS, Globex.'),
    ).toBeInTheDocument()
    await expect(page.getByText('Initech')).toBeInTheDocument()
    await expect(
      page.getByRole('button', { name: 'Run again' }),
    ).toBeInTheDocument()
  },
}

/** No early-access period: the button says why it cannot send. */
export const NoWindow: Story = {
  parameters: {
    msw: {
      handlers: [
        preview({
          count: 7,
          refusal:
            'This conference has no early-access period. Under Workshops, set a "Sponsor Early Access Opens" time that is earlier than the time registration opens for everyone.',
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await expect(
      await page.findByText(/no early-access period/),
    ).toBeInTheDocument()
    await expect(page.getByRole('button', { name: BUTTON })).toBeDisabled()
  },
}

export const NoWindowDark: Story = {
  ...NoWindow,
  globals: { theme: 'dark' },
}

/** Every Closed Won sponsor has had it. */
export const AllSent: Story = {
  parameters: {
    msw: { handlers: [preview({ count: 0, refusal: null })] },
  },
}
