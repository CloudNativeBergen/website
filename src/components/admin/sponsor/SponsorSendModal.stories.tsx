import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { delay, http, HttpResponse } from 'msw'
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
    slug: { current: 'contract-sent' },
    category: 'contract',
    language: 'en',
    subject: 'Your sponsorship contract',
    isDefault: true,
    body: [
      {
        _type: 'block',
        _key: 'cb1',
        style: 'normal',
        markDefs: [],
        children: [
          {
            _type: 'span',
            _key: 'cs1',
            text: 'Dear {{{SIGNER_NAME}}}, your sponsorship agreement for {{{CONFERENCE_TITLE}}} ({{{CONTRACT_VALUE}}}) is ready for review and digital signing.',
            marks: [],
          },
        ],
      },
    ],
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
  hasSponsorInviteLink: true,
  codes: [
    { code: 'ACMECLOUD-2026', selected: true, linked: true },
    { code: 'ACMECLOUD-WORKSHOP', selected: false, linked: false },
    { code: 'COMMUNITY2026', selected: false, linked: false },
    {
      code: 'ACMECLOUD-SPEAKERS',
      selected: false,
      linked: false,
      attributedTo: 'Acme Speakers AS',
    },
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

/**
 * What `registration.generateToken` answers for the Acme sponsor (#1263): the
 * EXISTING token, so a re-send previews the link already in an inbox.
 */
const registrationHandlers = [
  http.post('/api/trpc/registration.generateToken', () =>
    HttpResponse.json({
      result: {
        data: {
          token: 'tok-acme-existing',
          url: 'https://cloudnativebergen.dev/sponsor/portal/tok-acme-existing',
        },
      },
    }),
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
      within(codes).getByRole('checkbox', {
        name: 'ACMECLOUD-2026, already linked to this sponsor',
      }),
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
    const linked = await body.findByRole('checkbox', {
      name: 'ACMECLOUD-2026, already linked to this sponsor',
    })
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
    await body.findByRole('checkbox', {
      name: 'ACMECLOUD-2026, already linked to this sponsor',
    })
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
      await body.findByRole('checkbox', {
        name: 'ACMECLOUD-2026, already linked to this sponsor',
      }),
    ).toBeChecked()
  },
}

export const DiscountCodesDark: Story = {
  args: { kind: 'discount' },
  globals: { theme: 'dark' },
  parameters: { msw: { handlers: discountHandlers } },
}

/** What the save posts, so the play function can assert on it. */
const savedLinks: unknown[] = []

/**
 * No sponsor invite link on the conference: the email would point at a store
 * that hides sponsor tickets, so the modal says so — and lets the organizer
 * paste Checkin's invite link and save it to the conference right there.
 */
export const DiscountCodesNoInviteLink: Story = {
  args: { kind: 'discount' },
  beforeEach: () => {
    savedLinks.length = 0
  },
  parameters: {
    msw: {
      handlers: [
        http.post(
          '/api/trpc/conference.updateSponsorRegistrationLink',
          async ({ request }) => {
            const body = (await request.json()) as { json?: unknown } | unknown
            savedLinks.push(
              body && typeof body === 'object' && 'json' in body
                ? (body as { json: unknown }).json
                : body,
            )
            return HttpResponse.json({ result: { data: { success: true } } })
          },
        ),
        http.get('/api/trpc/sponsor.crm.discountCodeOptions', () =>
          HttpResponse.json({
            result: {
              data: {
                ...discountOptions,
                ticketUrl: 'https://cloudnativebergen.dev/tickets',
                hasSponsorInviteLink: false,
              },
            },
          }),
        ),
        ...handlers,
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(
      await body.findByText(/no sponsor ticket invite link/),
    ).toBeInTheDocument()
    const save = body.getByRole('button', { name: 'Save to conference' })
    await expect(save).toBeDisabled()
    await userEvent.type(
      body.getByLabelText('Sponsor ticket invite link'),
      'https://app.checkin.no/invite/sponsor-abc',
    )
    await expect(save).toBeEnabled()
    await userEvent.click(save)
    await waitFor(() =>
      expect(savedLinks).toEqual([
        {
          sponsorRegistrationLink: 'https://app.checkin.no/invite/sponsor-abc',
        },
      ]),
    )
  },
}

/** What `contractTemplates.contractReadiness` answers (#1264). */
const readinessHandler = (missing: Array<Record<string, string>> = []) =>
  http.get('/api/trpc/sponsor.contractTemplates.contractReadiness', () =>
    HttpResponse.json({
      result: {
        data: {
          ready: missing.length === 0,
          canSend: !missing.some((m) => m.severity === 'required'),
          missing,
        },
      },
    }),
  )
const contractHandlers = [readinessHandler(), ...handlers]
const SIGNING_URL = 'https://cloudnativebergen.dev/sponsor/contract/sign/agr-1'

/**
 * Send → Contract, first send (#1264). The button says what will happen; the
 * default contract template is applied; the signer is chosen among the
 * recipients (the primary contact by default); the preview carries the card
 * whose link is created when sending.
 */
export const Contract: Story = {
  args: { kind: 'contract', contractSend: { contractTemplateId: 'tpl-A' } },
  parameters: { msw: { handlers: contractHandlers } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await body.findByRole('checkbox', { name: 'Kari Nordmann' })
    // The action label (the send button itself reads "Disabled in Dev" locally).
    await expect(
      body.getByRole('heading', { name: 'Send contract' }),
    ).toBeInTheDocument()
    await expect(
      body.getByRole('radio', { name: 'Kari Nordmann signs' }),
    ).toBeChecked()
    await expect(
      body.getByDisplayValue('Your sponsorship contract'),
    ).toBeInTheDocument()
    await userEvent.click(body.getByRole('checkbox', { name: 'Ola Nordmann' }))
    await userEvent.click(
      body.getByRole('radio', { name: 'Ola Nordmann signs' }),
    )
    await expect(
      body.getByRole('radio', { name: 'Ola Nordmann signs' }),
    ).toBeChecked()
    // Two recipients, one signer: only the signer gets the link.
    await expect(body.getByText(/receives the signing link/)).toHaveTextContent(
      'Only Ola Nordmann receives the signing link; the other recipients get a copy without it.',
    )
    // The greeting was merged for Kari; re-applying names the new signer.
    await userEvent.click(
      body.getByRole('button', { name: 'Re-apply template' }),
    )
    await expect(await body.findByText(/Dear Ola Nordmann/)).toBeInTheDocument()
  },
}

/** Readiness fails: the modal lists what is missing and refuses (story 11). */
export const ContractNotReady: Story = {
  args: { kind: 'contract' },
  parameters: {
    msw: {
      handlers: [
        readinessHandler([
          {
            field: 'tier',
            label: 'Sponsor tier',
            source: 'pipeline',
            severity: 'required',
          },
          {
            field: 'contractValue',
            label: 'Contract value',
            source: 'pipeline',
            severity: 'required',
          },
          {
            field: 'conference.venueName',
            label: 'Venue',
            source: 'organizer',
            severity: 'recommended',
          },
        ]),
        ...handlers,
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const alert = await body.findByRole('alert')
    await expect(alert).toHaveTextContent('Sponsor tier')
    await expect(alert).toHaveTextContent('Contract value')
    await expect(alert).not.toHaveTextContent('Venue')
  },
}

/** A signature is pending: the same action is a reminder with the same signing link. */
export const ContractReminder: Story = {
  args: {
    kind: 'contract',
    sponsorForConference: mockSponsor({
      contactPersons: contacts,
      contractStatus: 'contract-sent',
      signatureStatus: 'pending',
      signatureId: 'agr-1',
      signingUrl: SIGNING_URL,
      signerName: 'Kari Nordmann',
      signerEmail: 'kari@acme.example',
    }),
  },
  parameters: { msw: { handlers: contractHandlers } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await body.findByRole('checkbox', { name: 'Kari Nordmann' })
    await expect(
      body.getByRole('heading', { name: 'Send reminder' }),
    ).toBeInTheDocument()
    await expect(body.queryByRole('radiogroup')).not.toBeInTheDocument()
    await userEvent.click(body.getByRole('button', { name: /Preview/ }))
    const button = await body.findByText('Review & sign agreement')
    await expect(button.closest('a')).toHaveAttribute('href', SIGNING_URL)
  },
}

/** The signer on record is no longer a contact: the server mails them too, and the composer says so. */
export const ContractReminderExternalSigner: Story = {
  args: {
    kind: 'contract',
    sponsorForConference: mockSponsor({
      contactPersons: contacts,
      contractStatus: 'contract-sent',
      signatureStatus: 'pending',
      signatureId: 'agr-1',
      signingUrl: SIGNING_URL,
      signerName: 'Eva Ekstern',
      signerEmail: 'eva@other.example',
    }),
  },
  parameters: { msw: { handlers: contractHandlers } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await body.findByRole('checkbox', { name: 'Kari Nordmann' })
    await expect(
      body.getByText(/also goes to the signer on record/),
    ).toHaveTextContent(
      'The reminder also goes to the signer on record, Eva Ekstern (eva@other.example), who is not among the contacts.',
    )
  },
}

/** Every contact was removed after issuance: the reminder still reaches the signer on record. */
export const ContractReminderNoContacts: Story = {
  args: {
    kind: 'contract',
    sponsorForConference: mockSponsor({
      contactPersons: [],
      contractStatus: 'contract-sent',
      signatureStatus: 'pending',
      signatureId: 'agr-1',
      signingUrl: SIGNING_URL,
      signerName: 'Eva Ekstern',
      signerEmail: 'eva@other.example',
    }),
  },
  parameters: { msw: { handlers: contractHandlers } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await body.findByText('No contact persons on this sponsor.')
    await expect(
      body.getByText(/also goes to the signer on record/),
    ).toBeInTheDocument()
    await expect(
      body.queryByText('Choose at least one recipient before sending.'),
    ).not.toBeInTheDocument()
  },
}

/** Signed: the same action sends the signed copy, linking the stored document. */
export const ContractSignedCopy: Story = {
  args: {
    kind: 'contract',
    sponsorForConference: mockSponsor({
      contactPersons: contacts,
      status: 'closed-won',
      contractStatus: 'contract-signed',
      signatureStatus: 'signed',
      signerName: 'Kari Nordmann',
      signerEmail: 'kari@acme.example',
      contractSignedBy: 'Kari Nordmann',
      contractDocument: {
        asset: {
          _ref: 'file-1',
          url: 'https://cdn.sanity.io/files/x/signed.pdf',
        },
      },
    }),
  },
  parameters: { msw: { handlers: contractHandlers } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await body.findByRole('checkbox', { name: 'Kari Nordmann' })
    await expect(
      body.getByRole('heading', { name: 'Send signed copy' }),
    ).toBeInTheDocument()
    await userEvent.click(body.getByRole('button', { name: /Preview/ }))
    const button = await body.findByText('Download signed agreement')
    await expect(button.closest('a')).toHaveAttribute(
      'href',
      'https://cdn.sanity.io/files/x/signed.pdf',
    )
    // Addressed to the person who signed.
    await expect(body.getByText(/Dear Kari Nordmann/)).toBeInTheDocument()
  },
}

export const ContractDark: Story = {
  args: { kind: 'contract', contractSend: { contractTemplateId: 'tpl-A' } },
  globals: { theme: 'dark' },
  parameters: { msw: { handlers: contractHandlers } },
}

/**
 * Send → Registration (#1263). The link is prepared on open from the sponsor's
 * existing token; the built-in welcome is the starting body, and the preview
 * carries the same "Complete your sponsor registration" card the server
 * appends — so editing the message can never lose the link.
 */
export const Registration: Story = {
  args: { kind: 'registration' },
  parameters: { msw: { handlers: registrationHandlers } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await body.findByRole('checkbox', { name: 'Kari Nordmann' })
    await waitFor(() =>
      expect(
        body.queryByText('Preparing the registration link…'),
      ).not.toBeInTheDocument(),
    )
    await expect(
      body.getByDisplayValue('Registration: Cloud Native Days Norway 2026'),
    ).toBeInTheDocument()
    await expect(body.getByText(/Welcome aboard, /)).toBeInTheDocument()
    await expect(
      body.queryByText(/has already completed registration/),
    ).not.toBeInTheDocument()
  },
}

/** Registration already complete: a notice, not a refusal — the send button stays. */
export const RegistrationComplete: Story = {
  args: {
    kind: 'registration',
    sponsorForConference: mockSponsor({
      contactPersons: contacts,
      registrationComplete: true,
      registrationToken: 'tok-acme-existing',
    }),
  },
  parameters: { msw: { handlers: registrationHandlers } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const notice = await body.findByText(/has already completed registration/)
    await expect(notice).toHaveAttribute('role', 'status')
    await expect(notice).toHaveTextContent(
      'opens their sponsorship status page',
    )
    // The composer is intact beneath the notice (the send button itself reads
    // "Disabled in Dev" on localhost, so it is not asserted by name).
    await expect(
      body.getByDisplayValue('Registration: Cloud Native Days Norway 2026'),
    ).toBeInTheDocument()
  },
}

/** The preview shows the registration card the server appends, with the portal link. */
export const RegistrationPreview: Story = {
  args: { kind: 'registration' },
  parameters: { msw: { handlers: registrationHandlers } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await body.findByRole('checkbox', { name: 'Kari Nordmann' })
    await waitFor(() =>
      expect(
        body.queryByText('Preparing the registration link…'),
      ).not.toBeInTheDocument(),
    )
    await userEvent.click(body.getByRole('button', { name: /Preview/ }))
    await expect(
      await body.findByText('Complete your sponsor registration'),
    ).toBeInTheDocument()
    await expect(
      body.getByRole('link', { name: 'Complete registration' }),
    ).toHaveAttribute(
      'href',
      'https://cloudnativebergen.dev/sponsor/portal/tok-acme-existing',
    )
  },
}

/** The link could not be prepared: the modal says why and refuses to send. */
export const RegistrationLinkFailed: Story = {
  args: { kind: 'registration' },
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/registration.generateToken', () =>
          HttpResponse.json(
            {
              error: {
                message: 'Conference has no domain configured.',
                code: -32603,
              },
            },
            { status: 500 },
          ),
        ),
        ...handlers,
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await expect(
      await body.findByRole('alert', undefined, { timeout: 15_000 }),
    ).toHaveTextContent(/could not be prepared/)
  },
}

/**
 * A template with a link annotation on the merge field, applied BEFORE the
 * link was prepared (the token request is slow here): the preview merges the
 * blocks the way the server does, so the link points at the portal — never at
 * a sanitised "#".
 */
export const RegistrationTemplateAppliedBeforeLink: Story = {
  args: { kind: 'registration' },
  parameters: {
    msw: {
      handlers: [
        http.post('/api/trpc/registration.generateToken', async () => {
          await delay(2500)
          return HttpResponse.json({
            result: {
              data: {
                token: 'tok-acme-existing',
                url: 'https://cloudnativebergen.dev/sponsor/portal/tok-acme-existing',
              },
            },
          })
        }),
        http.get('/api/trpc/sponsor.emailTemplates.list', () =>
          HttpResponse.json({
            result: {
              data: [
                {
                  _id: 'tpl-registration-link',
                  _createdAt: '2026-01-01T00:00:00Z',
                  _updatedAt: '2026-01-01T00:00:00Z',
                  title: 'Registration (link annotation)',
                  slug: { current: 'registration-link' },
                  category: 'custom',
                  language: 'en',
                  subject: 'Please register for {{{CONFERENCE_TITLE}}}',
                  isDefault: false,
                  body: [
                    {
                      _type: 'block',
                      _key: 'b1',
                      style: 'normal',
                      markDefs: [
                        {
                          _key: 'l1',
                          _type: 'link',
                          href: '{{{SPONSOR_PORTAL_URL}}}',
                        },
                      ],
                      children: [
                        {
                          _type: 'span',
                          _key: 's1',
                          text: 'Open the ',
                          marks: [],
                        },
                        {
                          _type: 'span',
                          _key: 's2',
                          text: 'registration form',
                          marks: ['l1'],
                        },
                        { _type: 'span', _key: 's3', text: '.', marks: [] },
                      ],
                    },
                  ],
                },
              ],
            },
          }),
        ),
        ...handlers.filter(
          (h) => !String(h.info.header).includes('emailTemplates'),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    await body.findByRole('checkbox', { name: 'Kari Nordmann' })
    // Still preparing: apply the template now.
    await expect(
      body.getByText('Preparing the registration link…'),
    ).toBeInTheDocument()
    const picker = await body.findByRole('combobox')
    await userEvent.selectOptions(picker, 'tpl-registration-link')
    await waitFor(() =>
      expect(
        body.getByDisplayValue(
          'Please register for Cloud Native Days Norway 2026',
        ),
      ).toBeInTheDocument(),
    )
    await waitFor(
      () =>
        expect(
          body.queryByText('Preparing the registration link…'),
        ).not.toBeInTheDocument(),
      { timeout: 10_000 },
    )
    await userEvent.click(body.getByRole('button', { name: /Preview/ }))
    await expect(
      await body.findByRole('link', { name: 'registration form' }),
    ).toHaveAttribute(
      'href',
      'https://cloudnativebergen.dev/sponsor/portal/tok-acme-existing',
    )
  },
}

export const RegistrationMobile: Story = {
  args: {
    kind: 'registration',
    sponsorForConference: mockSponsor({
      contactPersons: contacts,
      registrationComplete: true,
    }),
  },
  parameters: {
    msw: { handlers: registrationHandlers },
    viewport: { value: 'mobile1', isRotated: false },
  },
}

export const RegistrationDark: Story = {
  args: {
    kind: 'registration',
    sponsorForConference: mockSponsor({
      contactPersons: contacts,
      registrationComplete: true,
    }),
  },
  globals: { theme: 'dark' },
  parameters: { msw: { handlers: registrationHandlers } },
}
