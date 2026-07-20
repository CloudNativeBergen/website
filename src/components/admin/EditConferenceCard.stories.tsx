import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { userEvent, screen, expect } from 'storybook/test'
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
  http.post('/api/trpc/conference.updateSocialLinks', ok),
  http.post('/api/trpc/conference.updateFeatures', ok),
  http.post('/api/trpc/conference.updateVanityMetrics', ok),
  http.post('/api/trpc/conference.updateSponsorBenefits', ok),
  http.post('/api/trpc/conference.updateSponsorshipCustomization', ok),
  http.post('/api/trpc/conference.updateDomains', ok),
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

// === SE-1b: array & object fieldsets ======================================

const socialLinksInitial = {
  socialLinks: [
    'https://bsky.app/profile/cloudnativebergen.no',
    'https://www.linkedin.com/company/cloud-native-bergen',
  ],
}

/** The string-list editor (Social Links) — add/remove/reorder + URL rows. */
export const StringListEditor: Story = {
  args: {
    fieldset: 'socialLinks',
    initialValues: socialLinksInitial,
    defaultOpen: true,
  },
}

export const StringListEditorDark: Story = {
  args: {
    fieldset: 'socialLinks',
    initialValues: socialLinksInitial,
    defaultOpen: true,
  },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/** Adds a row, then removes it — asserting the row count via inputs. */
export const StringListAddRemove: Story = {
  args: {
    fieldset: 'socialLinks',
    initialValues: socialLinksInitial,
    defaultOpen: true,
  },
  play: async () => {
    const rowsBefore = screen.getAllByLabelText(/^link \d+$/)
    expect(rowsBefore).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'Add link' }))
    expect(screen.getAllByLabelText(/^link \d+$/)).toHaveLength(3)

    await userEvent.click(screen.getByRole('button', { name: 'Remove link 3' }))
    expect(screen.getAllByLabelText(/^link \d+$/)).toHaveLength(2)
  },
}

/** Moving row 1 down swaps it with row 2. */
export const StringListReorder: Story = {
  args: {
    fieldset: 'socialLinks',
    initialValues: socialLinksInitial,
    defaultOpen: true,
  },
  play: async () => {
    const first = screen.getByLabelText('link 1') as HTMLInputElement
    const second = screen.getByLabelText('link 2') as HTMLInputElement
    const firstValue = first.value
    const secondValue = second.value

    await userEvent.click(
      screen.getByRole('button', { name: 'Move link 1 down' }),
    )

    expect((screen.getByLabelText('link 1') as HTMLInputElement).value).toBe(
      secondValue,
    )
    expect((screen.getByLabelText('link 2') as HTMLInputElement).value).toBe(
      firstValue,
    )
  },
}

const vanityMetricsInitial = {
  vanityMetrics: [
    { _key: 'k1', label: 'Attendees', value: '400+' },
    { _key: 'k2', label: 'Talks', value: '32' },
  ],
}

/** The object-list editor (Vanity Metrics) — two-column rows. */
export const ObjectListEditor: Story = {
  args: {
    fieldset: 'vanityMetrics',
    initialValues: vanityMetricsInitial,
    defaultOpen: true,
  },
}

export const ObjectListEditorDark: Story = {
  args: {
    fieldset: 'vanityMetrics',
    initialValues: vanityMetricsInitial,
    defaultOpen: true,
  },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/** Sponsor Benefits — object-list with a Heroicon select column. */
export const ObjectListWithSelect: Story = {
  args: {
    fieldset: 'sponsorBenefits',
    initialValues: {
      sponsorBenefits: [
        {
          _key: 'b1',
          title: 'Reach senior engineers',
          description: 'Speak to the people who build the platforms.',
          icon: 'RocketLaunchIcon',
        },
      ],
    },
    defaultOpen: true,
  },
}

const domainsInitial = {
  domains: ['cloudnativebergen.no', 'cloudnativeday.no'],
}

/**
 * The safeguarded Domains modal: red warning banner, a LOCKED current-domain row
 * (lock icon, non-removable), a type-to-confirm input and a disabled red Save.
 */
export const DomainsDangerous: Story = {
  args: {
    fieldset: 'domains',
    initialValues: domainsInitial,
    currentDomain: 'cloudnativebergen.no',
    defaultOpen: true,
  },
}

export const DomainsDangerousDark: Story = {
  args: {
    fieldset: 'domains',
    initialValues: domainsInitial,
    currentDomain: 'cloudnativebergen.no',
    defaultOpen: true,
  },
  parameters: { theme: 'dark', backgrounds: { default: 'dark' } },
}

/** Save stays disabled until the current domain is typed verbatim. */
export const DomainsConfirmGating: Story = {
  args: {
    fieldset: 'domains',
    initialValues: domainsInitial,
    currentDomain: 'cloudnativebergen.no',
    defaultOpen: true,
  },
  play: async () => {
    // The current-domain row is locked (no remove button, a lock affordance).
    expect(screen.queryByRole('button', { name: 'Remove domain 1' })).toBeNull()

    // Make a change (add a domain) so only the confirm gate blocks Save.
    await userEvent.click(screen.getByRole('button', { name: 'Add domain' }))
    const newRow = screen.getByLabelText('domain 3')
    await userEvent.type(newRow, 'cnd.example.com')

    const save = screen.getByRole('button', { name: 'Save domains' })
    expect(save).toBeDisabled()

    const confirm = screen.getByLabelText(
      /Type cloudnativebergen\.no to confirm/,
    )
    await userEvent.type(confirm, 'cloudnativebergen.no')
    expect(save).toBeEnabled()
  },
}
