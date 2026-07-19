import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { userEvent, screen } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { ThemeProvider } from 'next-themes'
import { EditConferenceCard } from './EditConferenceCard'
import { NotificationProvider } from './NotificationProvider'

// Every fieldset mutation resolves successfully so a Save in a story never
// hits the network unhandled.
const ok = () =>
  HttpResponse.json({ result: { data: { success: true, updated: {} } } })
const handlers = [
  http.post('/api/trpc/conference.updateBasicInfo', ok),
  http.post('/api/trpc/conference.updateVenue', ok),
  http.post('/api/trpc/conference.updateDates', ok),
  http.post('/api/trpc/conference.updateRegistration', ok),
  http.post('/api/trpc/conference.updateCommunication', ok),
  http.post('/api/trpc/conference.updateTicketingIds', ok),
  http.post('/api/trpc/conference.updateCfpGoals', ok),
]

const meta = {
  title: 'Systems/Settings/Admin/EditConferenceCard',
  component: EditConferenceCard,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'SE-1a — the shared, fieldset-parameterized editor behind each admin settings InfoCard. A 44px pencil opens a mobile-sheet ModalShell form scoped to ONE scalar fieldset; Save patches only that fieldset and refreshes the server-rendered card. Stories open the modal on mount (`defaultOpen`) so the form is the subject.',
      },
    },
  },
  decorators: [
    (Story, ctx) => {
      const dark = ctx.parameters.theme === 'dark'
      return (
        // ModalShell reads next-themes and HeadlessUI portals the dialog to
        // <body> (outside any wrapper div), so forcing the theme here is what
        // actually renders the modal dark — a plain `.dark` wrapper wouldn't
        // reach the portal.
        <ThemeProvider
          attribute="class"
          forcedTheme={dark ? 'dark' : 'light'}
          enableSystem={false}
        >
          <NotificationProvider>
            <div className={dark ? 'dark' : ''}>
              <div className="min-h-screen bg-white p-6 dark:bg-gray-950">
                <Story />
              </div>
            </div>
          </NotificationProvider>
        </ThemeProvider>
      )
    },
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof EditConferenceCard>

export default meta
type Story = StoryObj<typeof meta>

const datesInitial = {
  startDate: '2026-10-15',
  endDate: '2026-10-16',
  cfpStartDate: '2026-01-10',
  cfpEndDate: '2026-05-01',
  cfpNotifyDate: '2026-06-15',
  programDate: '2026-07-01',
  travelSupportPaymentDate: '2026-11-01',
  travelSupportBudget: 50000,
}

const communicationInitial = {
  contactEmail: 'hello@cloudnativebergen.dev',
  cfpEmail: 'cfp@cloudnativebergen.dev',
  sponsorEmail: 'sponsors@cloudnativebergen.dev',
  salesNotificationChannel: '#cnb-sales',
  cfpNotificationChannel: '#cnb-cfp',
}

/** A text + date + number fieldset (the Dates & Timeline card), modal open. */
export const TextDateFieldset: Story = {
  args: { fieldset: 'dates', initialValues: datesInitial, defaultOpen: true },
}

export const TextDateFieldsetDark: Story = {
  args: { fieldset: 'dates', initialValues: datesInitial, defaultOpen: true },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/** An email fieldset (Communication) showing the inline validation error state. */
export const EmailFieldsetError: Story = {
  args: {
    fieldset: 'communication',
    initialValues: communicationInitial,
    defaultOpen: true,
  },
  play: async () => {
    // ModalShell portals to <body>, so query the whole document, not the canvas.
    const contact = await screen.findByLabelText(/Contact Email/)
    await userEvent.clear(contact)
    await userEvent.type(contact, 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Enter a valid email address')
  },
}

export const EmailFieldsetErrorDark: Story = {
  args: {
    fieldset: 'communication',
    initialValues: communicationInitial,
    defaultOpen: true,
  },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
  play: async () => {
    // ModalShell portals to <body>, so query the whole document, not the canvas.
    const contact = await screen.findByLabelText(/Contact Email/)
    await userEvent.clear(contact)
    await userEvent.type(contact, 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Enter a valid email address')
  },
}
