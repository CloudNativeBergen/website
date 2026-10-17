import { useEffect, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, userEvent, within, waitFor } from 'storybook/test'
import { WorkshopReminderButton } from './WorkshopReminderButton'
import type { ReadyTicketHolderStats } from './holders/view'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AcademicCapIcon } from '@heroicons/react/24/outline'

/**
 * The organizer's "Remind people who haven't signed up" (#1334) in the
 * /admin/workshops header: offered once the portal link works, confirmed in a
 * dialog that says how many will receive it and when the last one went out,
 * with an optional note.
 *
 * Dark mode comes from the GLOBAL decorator (`globals.theme`), which sets it on
 * a wrapper. The dialog is portaled outside that wrapper, so the decorator
 * below sets it on the document too.
 */
const ENDPOINT = '/api/trpc/workshop.admin.sendReminder'
const sent = http.post(ENDPOINT, () =>
  HttpResponse.json({
    result: {
      data: {
        sent: 42,
        failed: 0,
        unconfirmed: 0,
        sentAt: '2026-10-17T09:30:00.000Z',
      },
    },
  }),
)

const stats: ReadyTicketHolderStats = {
  available: true,
  configured: true,
  holders: 180,
  confirmed: 120,
  waitlistOnly: 18,
  notSignedUp: 42,
  flagged: [],
  lockedOut: [],
}

function DocumentTheme({
  dark,
  children,
}: {
  dark: boolean
  children: ReactNode
}) {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    return () => document.documentElement.classList.remove('dark')
  }, [dark])
  return children
}

const meta = {
  title: 'Systems/Workshops/Admin/WorkshopReminderButton',
  component: WorkshopReminderButton,
  parameters: { msw: { handlers: [sent] } },
  decorators: [
    (Story, context) => (
      <DocumentTheme dark={context.globals.theme === 'dark'}>
        <NotificationProvider>
          <div className="flex justify-end p-6">
            <Story />
          </div>
        </NotificationProvider>
      </DocumentTheme>
    ),
  ],
  args: {
    disabledReason: null,
    recipients: { state: 'ready', stats },
    lastSent: { at: '2026-10-10T12:00:00.000Z', count: 51 },
  },
} satisfies Meta<typeof WorkshopReminderButton>

export default meta
type Story = StoryObj<typeof meta>

const BUTTON = /Remind people who haven.t signed up/

async function openDialog(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body)
  await userEvent.click(page.getByRole('button', { name: BUTTON }))
  await page.findByRole('button', { name: 'Send reminder' })
  return page
}

/**
 * The whole round: the dialog counts the recipients and names the last send,
 * the note goes with the request, and the dialog then shows the send it made.
 */
export const Available: Story = {
  play: async ({ canvasElement }) => {
    const page = await openDialog(canvasElement)
    await expect(
      page.getByText('42 people, counted again when you send'),
    ).toBeInTheDocument()
    await expect(
      // The house locale's wording around the time differs between engines.
      page.getByText(/^10\. oktober 2026\D+14:00, to 51 people$/),
    ).toBeInTheDocument()
    await userEvent.type(
      page.getByLabelText('Note (optional)'),
      'Bring a laptop',
    )
    await userEvent.click(page.getByRole('button', { name: 'Send reminder' }))
    await waitFor(() =>
      expect(
        page.getByText('Sent to 42 people who had not signed up.'),
      ).toBeInTheDocument(),
    )
    await openDialog(canvasElement)
    await expect(
      page.getByText(/^17\. oktober 2026\D+11:30, to 42 people$/),
    ).toBeInTheDocument()
    // The note went out with that send; a new reminder starts without it.
    await expect(page.getByLabelText('Note (optional)')).toHaveValue('')
  },
}

/** The dialog as the organizer reads it, for the light and dark captures. */
export const Dialog: Story = {
  play: async ({ canvasElement }) => {
    const page = await openDialog(canvasElement)
    await userEvent.type(
      page.getByLabelText('Note (optional)'),
      'Doors open at 8. Bring a laptop with Docker installed.',
    )
  },
}

export const DialogDark: Story = {
  ...Dialog,
  globals: { theme: 'dark' },
}

/** No reminder has gone out for this conference. */
export const NeverSent: Story = {
  args: { lastSent: null },
  play: async ({ canvasElement }) => {
    const page = await openDialog(canvasElement)
    await expect(page.getByText('No reminder sent yet')).toBeInTheDocument()
  },
}

export const NeverSentDark: Story = {
  ...NeverSent,
  globals: { theme: 'dark' },
}

/** The holders are still being read. */
export const Counting: Story = {
  args: { recipients: { state: 'loading' } },
  play: async ({ canvasElement }) => {
    const page = await openDialog(canvasElement)
    await expect(page.getByText('Counting…')).toBeInTheDocument()
  },
}

/** The holders could not be read: never shown as zero. */
export const CountUnavailable: Story = {
  args: { recipients: { state: 'unavailable', retrying: false } },
  play: async ({ canvasElement }) => {
    const page = await openDialog(canvasElement)
    await expect(
      page.getByText('Could not be counted now; counted again when you send'),
    ).toBeInTheDocument()
  },
}

/** A note over 1,000 characters cannot be sent; the server refuses it too. */
export const NoteTooLong: Story = {
  play: async ({ canvasElement }) => {
    const page = await openDialog(canvasElement)
    const note = page.getByLabelText('Note (optional)')
    await userEvent.click(note)
    await userEvent.paste('x'.repeat(1001))
    await expect(note).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText('1,001 / 1,000 — too long')).toBeInTheDocument()
    await expect(
      page.getByRole('button', { name: 'Send reminder' }),
    ).toBeDisabled()
  },
}

const NO_LINK =
  'Available once attendees can sign in on 2026.cloudnativedays.no, the conference’s first domain.'

/**
 * The portal link does not work yet: nothing to send, and it says why in
 * visible text tied to the button — a disabled button cannot be focused to
 * show a tooltip.
 */
export const Unavailable: Story = {
  args: { disabledReason: NO_LINK },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', {
      name: BUTTON,
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
      handlers: [http.post(ENDPOINT, () => HttpResponse.error())],
    },
  },
  play: async ({ canvasElement }) => {
    const page = await openDialog(canvasElement)
    await userEvent.click(page.getByRole('button', { name: 'Send reminder' }))
    await expect(
      await page.findByText('The reminder did not finish'),
    ).toBeInTheDocument()
    await expect(page.queryByText('Nothing was sent')).not.toBeInTheDocument()
  },
}

/** The provider never answered for some: they may have arrived, so wait. */
export const Unconfirmed: Story = {
  parameters: {
    msw: {
      handlers: [
        http.post(ENDPOINT, () =>
          HttpResponse.json({
            result: {
              data: {
                sent: 100,
                failed: 0,
                unconfirmed: 50,
                sentAt: '2026-10-17T09:30:00.000Z',
              },
            },
          }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const page = await openDialog(canvasElement)
    await userEvent.click(page.getByRole('button', { name: 'Send reminder' }))
    await expect(
      await page.findByText('Some emails could not be confirmed'),
    ).toBeInTheDocument()
    await expect(page.getByText(/they may have arrived/)).toBeInTheDocument()
  },
}

/**
 * In the /admin/workshops header on a phone, with the disabled reason showing:
 * the action sits below the stats, so nothing pushes the page sideways.
 */
export const InHeaderMobile: Story = {
  args: { disabledReason: NO_LINK },
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  render: (args) => (
    <div className="p-4">
      <AdminPageHeader
        title="Workshop Management"
        description="Manage workshop signups and capacity"
        icon={<AcademicCapIcon className="h-6 w-6" />}
        stats={[
          { value: 6, label: 'Total Workshops', color: 'blue' },
          { value: 112, label: 'Unique Participants', color: 'purple' },
          { value: 180, label: 'Total Signups', color: 'slate' },
        ]}
      >
        <div className="mt-4 flex justify-end">
          <WorkshopReminderButton {...args} />
        </div>
      </AdminPageHeader>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const root = canvasElement.ownerDocument.documentElement
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
    await expect(within(canvasElement).getByText(NO_LINK)).toBeVisible()
  },
}

export const UnavailableDark: Story = {
  args: { disabledReason: NO_LINK },
  globals: { theme: 'dark' },
}

/** The dialog, on a phone: nothing pushes the page sideways. */
export const ConfirmMobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    await openDialog(canvasElement)
    const root = canvasElement.ownerDocument.documentElement
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth)
  },
}
