import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { SponsorSendModal } from './SponsorSendModal'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import { withPortalTheme } from '@/lib/storybook'
import { mockContactPerson, mockSponsor } from '@/__mocks__/sponsor-data'

const FIXED_NOW = new Date('2026-02-15T12:00:00Z')

const contacts = [
  mockContactPerson({
    _key: 'c-primary',
    name: 'Kari Nordmann',
    email: 'kari@acme.example',
    role: 'Partnership Manager',
    isPrimary: true,
  }),
  mockContactPerson({
    _key: 'c-billing',
    name: 'Ola Nordmann',
    email: 'ola@acme.example',
    role: 'Billing Reference',
  }),
  mockContactPerson({
    _key: 'c-noemail',
    name: 'Per Hansen',
    email: '',
    role: 'Technical Contact',
  }),
]

const sponsor = mockSponsor({ contactPersons: contacts })

const templates = [
  {
    _id: 'tpl-contract-en',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    title: 'Contract (EN)',
    slug: { current: 'contract-en' },
    category: 'contract',
    language: 'en',
    subject: 'Your sponsorship contract',
    isDefault: true,
    body: [],
  },
  {
    _id: 'tpl-info-en',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    title: 'Booth information',
    slug: { current: 'booth-information' },
    category: 'follow-up',
    language: 'en',
    subject: 'Booth information for {{{CONFERENCE_TITLE}}}',
    isDefault: true,
    body: [
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        markDefs: [],
        children: [
          {
            _type: 'span',
            _key: 's1',
            text: 'Hi {{{CONTACT_NAMES}}}, here is everything about your booth at {{{CONFERENCE_TITLE}}}.',
            marks: [],
          },
        ],
      },
    ],
  },
]

/** Records what the modal posts so the play function can assert on it. */
const sent: unknown[] = []

const handlers = [
  http.get('/api/trpc/sponsor.emailTemplates.list', () =>
    HttpResponse.json({ result: { data: templates } }),
  ),
  http.post('/api/trpc/sponsor.crm.sendCommunication', async ({ request }) => {
    const body = (await request.json()) as { json?: unknown } | unknown
    sent.push(
      body && typeof body === 'object' && 'json' in body
        ? (body as { json: unknown }).json
        : body,
    )
    return HttpResponse.json({
      result: {
        data: {
          success: true,
          activityId: 'act-1',
          providerMessageId: 'resend-1',
          recipientCount: 2,
        },
      },
    })
  }),
]

/** What `crm.discountCodeOptions` answers for the Acme sponsor (#1262). */
const discountOptions = {
  ticketUrl: 'https://tickets.example.test/sponsor-invite',
  codes: [
    { code: 'ACMECLOUD-2026', selected: true, linked: true },
    { code: 'ACMECLOUD-WORKSHOP', selected: false, linked: false },
    { code: 'COMMUNITY2026', selected: false, linked: false },
    {
      code: 'GLOBEX-VIP',
      selected: false,
      linked: false,
      linkedTo: 'Globex Corporation',
    },
  ],
}

const discountHandlers = [
  http.get('/api/trpc/sponsor.crm.discountCodeOptions', () =>
    HttpResponse.json({ result: { data: discountOptions } }),
  ),
  ...handlers,
]

const meta = {
  title: 'Systems/Sponsors/Admin/Email/SponsorSendModal',
  component: SponsorSendModal,
  tags: ['autodocs'],
  beforeEach: () => {
    sent.length = 0
    const OriginalDate = globalThis.Date
    const fixedTime = FIXED_NOW.getTime()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const MockDate: any = function (...args: any[]) {
      if (args.length === 0) return new OriginalDate(fixedTime)
      return new (
        Function.prototype.bind.apply(OriginalDate, [
          null,
          ...args,
        ]) as typeof OriginalDate
      )()
    }
    Object.setPrototypeOf(MockDate, OriginalDate)
    MockDate.prototype = Object.create(OriginalDate.prototype)
    MockDate.now = () => fixedTime
    MockDate.parse = OriginalDate.parse.bind(OriginalDate)
    MockDate.UTC = OriginalDate.UTC.bind(OriginalDate)
    globalThis.Date = MockDate
    return () => {
      globalThis.Date = OriginalDate
    }
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The one Send action for a sponsor (#1261). The To: line lists every contact as a toggle with the primary contact preselected as the default recipient; a contact without an email is shown but cannot be chosen. Start from a template, edit, preview, send. The server resolves the chosen contact keys to addresses and records exactly what went out on the activity timeline.',
      },
    },
    msw: { handlers },
  },
  args: {
    isOpen: true,
    onClose: fn(),
    onSent: fn(),
    sponsorForConference: sponsor,
    kind: 'information',
    domain: 'cloudnativebergen.dev',
    fromEmail: 'sponsors@cloudnativebergen.dev',
    senderName: 'Hans Kristian',
    conference: {
      title: 'Cloud Native Days Norway 2026',
      city: 'Bergen',
      country: 'Norway',
      startDate: '2026-10-28',
      organizer: 'Cloud Native Days Norway',
      domains: ['cloudnativebergen.dev'],
    },
  },
  decorators: [
    // The modal portals to <body>, outside the global decorator's `dark`
    // wrapper — without this a dark capture renders light.
    withPortalTheme,
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
} satisfies Meta<typeof SponsorSendModal>

export default meta
type Story = StoryObj<typeof meta>

/** Opens with the primary contact preselected; the email-less contact is shown but disabled. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const primary = await body.findByRole('checkbox', { name: 'Kari Nordmann' })
    await expect(primary).toBeChecked()
    await expect(
      body.getByRole('checkbox', { name: 'Ola Nordmann' }),
    ).not.toBeChecked()
    await expect(
      body.getByRole('checkbox', { name: 'Per Hansen (no email)' }),
    ).toBeDisabled()
    const recipients = body.getByRole('group', { name: 'Recipients' })
    await expect(within(recipients).getByText('Default')).toBeInTheDocument()
    // The kind's default template is applied on open, and the picker never
    // offers a contract template for an information send.
    await body.findByDisplayValue(
      'Booth information for Cloud Native Days Norway 2026',
    )
    const picker = await body.findByRole('combobox')
    await expect(
      within(picker).queryByRole('option', { name: /Contract \(EN\)/ }),
    ).not.toBeInTheDocument()
  },
}

/**
 * A second recipient is one click, and a template fills subject and body with
 * the chosen contacts' names merged in. Sending itself is disabled on
 * localhost by EmailModal, so the posted payload (keys only, template
 * provenance) is pinned in the vitest suite instead.
 */
export const SendToTwoContacts: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await body.findByRole('checkbox', { name: 'Kari Nordmann' })
    await userEvent.click(body.getByRole('checkbox', { name: 'Ola Nordmann' }))
    await expect(
      body.getByRole('checkbox', { name: 'Ola Nordmann' }),
    ).toBeChecked()

    const picker = await body.findByRole('combobox')
    await userEvent.selectOptions(picker, 'tpl-info-en')
    await waitFor(() =>
      expect(
        body.getByDisplayValue(
          'Booth information for Cloud Native Days Norway 2026',
        ),
      ).toBeInTheDocument(),
    )
    await expect(
      body.getByText(/Hi Kari Nordmann and Ola Nordmann/),
    ).toBeInTheDocument()
  },
}

/** Deselecting every contact surfaces the hint (the client-side refusal itself is pinned in vitest). */
export const NoRecipientChosen: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const primary = await body.findByRole('checkbox', { name: 'Kari Nordmann' })
    await userEvent.click(primary)
    await expect(primary).not.toBeChecked()
    await expect(
      body.getByText('Choose at least one recipient before sending.'),
    ).toBeInTheDocument()
  },
}

/** A sponsor with no contacts at all explains itself instead of showing an empty To: line. */
export const NoContacts: Story = {
  args: {
    sponsorForConference: mockSponsor({ contactPersons: [] }),
  },
}

/** Templates fail to load: the modal still opens, says so, and applies nothing. */
export const TemplatesUnavailable: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/sponsor.emailTemplates.list', () =>
          HttpResponse.json(
            {
              error: {
                message: 'Failed to list email templates',
                code: -32603,
              },
            },
            { status: 500 },
          ),
        ),
        ...handlers.filter(
          (h) => !String(h.info.header).includes('emailTemplates'),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await body.findByText(/Templates could not be loaded/, undefined, {
      timeout: 15_000,
    })
    await expect(
      body.getByDisplayValue('Information: Cloud Native Days Norway 2026'),
    ).toBeInTheDocument()
  },
}

export const Mobile: Story = {
  parameters: {
    viewport: { value: 'mobile1', isRotated: false },
  },
}

/**
 * Send → Discount codes (#1262). The Codes: line lists the event's codes from
 * the ticket provider: the sponsor's stored code is preselected and marked
 * Linked, and a code stored on another sponsor is shown but cannot be picked.
 * The preview carries the same codes block the server appends.
 */
export const DiscountCodes: Story = {
  args: { kind: 'discount' },
  parameters: { msw: { handlers: discountHandlers } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const codes = await body.findByRole('group', { name: 'Discount codes' })
    await expect(
      within(codes).getByRole('checkbox', { name: 'ACMECLOUD-2026' }),
    ).toBeChecked()
    await expect(
      within(codes).getByRole('checkbox', {
        name: 'GLOBEX-VIP (linked to Globex Corporation)',
      }),
    ).toBeDisabled()
    await userEvent.click(
      within(codes).getByRole('checkbox', { name: 'ACMECLOUD-WORKSHOP' }),
    )
    await expect(
      within(codes).getByRole('checkbox', { name: 'ACMECLOUD-WORKSHOP' }),
    ).toBeChecked()
    await expect(
      body.getByDisplayValue('Discount codes: Cloud Native Days Norway 2026'),
    ).toBeInTheDocument()
  },
}

/** Unticking every code surfaces the hint; the refusal itself is pinned in vitest. */
export const DiscountCodesNoneChosen: Story = {
  args: { kind: 'discount' },
  parameters: { msw: { handlers: discountHandlers } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const linked = await body.findByRole('checkbox', { name: 'ACMECLOUD-2026' })
    await userEvent.click(linked)
    await expect(linked).not.toBeChecked()
    await expect(
      body.getByText('Choose at least one discount code before sending.'),
    ).toBeInTheDocument()
  },
}

/** The preview shows the codes block the server appends to the email. */
export const DiscountCodesPreview: Story = {
  args: { kind: 'discount' },
  parameters: { msw: { handlers: discountHandlers } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await body.findByRole('checkbox', { name: 'ACMECLOUD-2026' })
    await userEvent.click(body.getByRole('button', { name: /Preview/ }))
    await expect(
      await body.findByText('Your discount code'),
    ).toBeInTheDocument()
    await expect(body.getByText('ACMECLOUD-2026')).toBeInTheDocument()
  },
}

export const DiscountCodesMobile: Story = {
  args: { kind: 'discount' },
  parameters: {
    msw: { handlers: discountHandlers },
    viewport: { value: 'mobile1', isRotated: false },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(
      await body.findByRole('checkbox', { name: 'ACMECLOUD-2026' }),
    ).toBeChecked()
  },
}

export const DiscountCodesDark: Story = {
  args: { kind: 'discount' },
  globals: { theme: 'dark' },
  parameters: { msw: { handlers: discountHandlers } },
}
