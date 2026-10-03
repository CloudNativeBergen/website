import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { AssignDiscountCodeDialog } from './AssignDiscountCodeDialog'
import { NotificationProvider } from './NotificationProvider'
import { withPortalTheme } from '@/lib/storybook'

/** Records what the dialog posts so the play function can assert on it. */
const posted: unknown[] = []

const handlers = [
  http.post(
    '/api/trpc/sponsor.crm.assignDiscountCodes',
    async ({ request }) => {
      const body = (await request.json()) as { json?: unknown } | unknown
      posted.push(
        body && typeof body === 'object' && 'json' in body
          ? (body as { json: unknown }).json
          : body,
      )
      return HttpResponse.json({
        result: { data: { success: true, linkedCodes: ['COMMUNITY2026'] } },
      })
    },
  ),
]

const meta = {
  title: 'Systems/Sponsors/Admin/AssignDiscountCodeDialog',
  component: AssignDiscountCodeDialog,
  tags: ['autodocs'],
  beforeEach: () => {
    posted.length = 0
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Discount code manager → Assign to sponsor (#1262): link a code created in advance to a sponsor without emailing it. The sponsor’s row then counts the code’s redemptions and its next discount send preselects it.',
      },
    },
    msw: { handlers },
  },
  args: {
    isOpen: true,
    onClose: fn(),
    onAssigned: fn(),
    code: 'COMMUNITY2026',
    sponsors: [
      { sponsorForConferenceId: 'sfc-acme', name: 'Acme Corporation' },
      { sponsorForConferenceId: 'sfc-globex', name: 'Globex Corporation' },
    ],
  },
  decorators: [
    // The dialog portals to <body>, outside the global `dark` wrapper.
    withPortalTheme,
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
} satisfies Meta<typeof AssignDiscountCodeDialog>

export default meta
type Story = StoryObj<typeof meta>

/** Assign stays disabled until a sponsor is chosen, then posts that sponsor’s CRM record and the code. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body)
    const assign = await body.findByRole('button', { name: 'Assign' })
    await expect(assign).toBeDisabled()
    await userEvent.selectOptions(body.getByLabelText('Sponsor'), 'sfc-globex')
    await expect(assign).toBeEnabled()
    await userEvent.click(assign)
    await waitFor(() =>
      expect(args.onAssigned).toHaveBeenCalledWith('Globex Corporation'),
    )
    await expect(posted).toEqual([
      {
        sponsorForConferenceId: 'sfc-globex',
        discountCodes: ['COMMUNITY2026'],
      },
    ])
  },
}

export const Mobile: Story = {
  parameters: { viewport: { value: 'mobile1', isRotated: false } },
}

export const Dark: Story = {
  globals: { theme: 'dark' },
}
