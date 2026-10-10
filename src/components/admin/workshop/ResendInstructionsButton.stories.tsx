import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { ResendInstructionsButton } from './ResendInstructionsButton'
import { NotificationProvider } from '@/components/admin/NotificationProvider'

/**
 * The organizer's "Resend sign-up instructions" (#1298) in the /admin/workshops
 * header: offered once the portal link works, confirmed before it mails every
 * workshop ticket holder.
 *
 * Dark mode comes from the GLOBAL decorator (`globals.theme`); this file has
 * no theme decorator of its own.
 */
const sent = http.post(
  '/api/trpc/workshop.admin.resendSignupInstructions',
  () => HttpResponse.json({ result: { data: { sent: 42, failed: 0 } } }),
)

const meta = {
  title: 'Systems/Workshops/Admin/ResendInstructionsButton',
  component: ResendInstructionsButton,
  parameters: { msw: { handlers: [sent] } },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <div className="flex justify-end p-6">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
  args: { disabledReason: null },
} satisfies Meta<typeof ResendInstructionsButton>

export default meta
type Story = StoryObj<typeof meta>

export const Available: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(
      page.getByRole('button', { name: /Resend sign-up instructions/ }),
    )
    await expect(
      await page.findByText('Resend sign-up instructions?'),
    ).toBeInTheDocument()
    await userEvent.click(
      page.getByRole('button', { name: 'Send to all holders' }),
    )
    await waitFor(() =>
      expect(
        page.getByText('Sent to 42 workshop ticket holders.'),
      ).toBeInTheDocument(),
    )
  },
}

const NO_LINK =
  'Available once attendees can sign in on the conference’s main host.'

/**
 * The portal link does not work yet: nothing to resend, and it says why in
 * visible text tied to the button — a disabled button cannot be focused to
 * show a tooltip.
 */
export const Unavailable: Story = {
  args: { disabledReason: NO_LINK },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', {
      name: /Resend sign-up instructions/,
    })
    await expect(button).toBeDisabled()
    await expect(button).toHaveAccessibleDescription(NO_LINK)
  },
}

/** Registration has closed: the email would only say so. */
export const RegistrationClosed: Story = {
  args: { disabledReason: 'Workshop registration has closed.' },
}

/**
 * The request never finished (a timeout, a dropped connection): some emails
 * may have gone, so it must not say "Nothing was sent".
 */
export const Interrupted: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/workshop.admin.resendSignupInstructions', () =>
          HttpResponse.error(),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(
      page.getByRole('button', { name: /Resend sign-up instructions/ }),
    )
    await userEvent.click(
      await page.findByRole('button', { name: 'Send to all holders' }),
    )
    await expect(
      await page.findByText('The resend did not finish'),
    ).toBeInTheDocument()
    await expect(page.queryByText('Nothing was sent')).not.toBeInTheDocument()
  },
}

export const AvailableDark: Story = { globals: { theme: 'dark' } }

export const UnavailableDark: Story = {
  args: { disabledReason: NO_LINK },
  globals: { theme: 'dark' },
}

/** The confirmation, on a phone. */
export const ConfirmMobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(
      page.getByRole('button', { name: /Resend sign-up instructions/ }),
    )
    await expect(
      await page.findByRole('button', { name: 'Send to all holders' }),
    ).toBeInTheDocument()
    const root = canvasElement.ownerDocument.documentElement
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
  },
}
