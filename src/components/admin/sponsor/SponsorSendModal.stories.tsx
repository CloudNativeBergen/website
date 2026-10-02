import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { SponsorSendModal } from './SponsorSendModal'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
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

/** Deselecting every contact surfaces the hint and the send is refused client-side. */
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

export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
}
