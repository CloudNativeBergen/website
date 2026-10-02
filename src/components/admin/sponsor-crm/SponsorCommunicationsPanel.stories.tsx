import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { SponsorCommunicationsPanel } from './SponsorCommunicationsPanel'
import type { SponsorActivityExpanded } from '@/lib/sponsor-crm/types'

const FIXED_NOW = new Date('2026-02-15T12:00:00Z')

const sfc = {
  _id: 'sfc-123',
  sponsor: { _id: 'sponsor-123', name: 'Acme Corporation' },
}
const hans = { _id: 'org-1', name: 'Hans Kristian', email: 'hans@example.com' }

function sentEmail(
  id: string,
  overrides: Partial<SponsorActivityExpanded> = {},
): SponsorActivityExpanded {
  return {
    _id: id,
    _createdAt: '2026-02-14T09:00:00Z',
    _updatedAt: '2026-02-14T09:00:00Z',
    sponsorForConference: sfc,
    activityType: 'email',
    description: 'Information sent to Kari Nordmann (+1)',
    createdBy: hans,
    createdAt: '2026-02-14T09:00:00Z',
    communicationKind: 'information',
    recipients: [
      {
        contactKey: 'c-primary',
        name: 'Kari Nordmann',
        email: 'kari@acme.example',
        role: 'Partnership Manager',
        isDefault: true,
      },
      {
        contactKey: 'c-billing',
        name: 'Ola Nordmann',
        email: 'ola@acme.example',
        role: 'Billing Reference',
        isDefault: false,
      },
    ],
    subject: 'Booth information for Cloud Native Days Norway 2026',
    deliveryStatus: 'sent',
    templateId: 'tpl-info-en',
    template: { _id: 'tpl-info-en', title: 'Booth information' },
    templateEdited: true,
    providerMessageId: 'a1b2c3d4-0000-4000-8000-000000000001',
    ...overrides,
  }
}

const all = [
  sentEmail('act-info-1'),
  sentEmail('act-failed', {
    createdAt: '2026-02-13T16:00:00Z',
    description: 'Information failed to send to Ola Nordmann',
    deliveryStatus: 'failed',
    error: 'Resend: domain not verified',
    recipients: [
      {
        contactKey: 'c-billing',
        name: 'Ola Nordmann',
        email: 'ola@acme.example',
        role: 'Billing Reference',
        isDefault: false,
      },
    ],
    providerMessageId: undefined,
    templateId: null,
    template: null,
    templateEdited: undefined,
  }),
  sentEmail('act-contract', {
    createdAt: '2026-02-10T10:00:00Z',
    communicationKind: 'contract',
    description: 'Contract sent to Kari Nordmann',
    subject: 'Your sponsorship contract',
    recipients: [
      {
        contactKey: 'c-primary',
        name: 'Kari Nordmann',
        email: 'kari@acme.example',
        role: 'Partnership Manager',
        isDefault: true,
      },
    ],
    templateId: 'tpl-contract',
    template: { _id: 'tpl-contract', title: 'Contract (EN)' },
    templateEdited: false,
  }),
]

const bodyHtml = `<!doctype html><html><body style="font-family:system-ui;padding:24px;color:#1f2937">
<h1 style="font-size:20px">Booth information</h1>
<p>Hi Kari and Ola, here is everything about your booth at Cloud Native Days Norway 2026.</p>
<p>Best regards,<br/>Hans Kristian</p></body></html>`

function handlersFor(items: SponsorActivityExpanded[]) {
  return [
    http.get(
      '/api/trpc/sponsor.crm.activities.listCommunications',
      ({ request }) => {
        const url = new URL(request.url)
        const raw = url.searchParams.get('input')
        const input = raw ? (JSON.parse(raw) as { kind?: string }) : {}
        const filtered = input.kind
          ? items.filter((i) => i.communicationKind === input.kind)
          : items
        return HttpResponse.json({
          result: { data: { items: filtered, total: filtered.length } },
        })
      },
    ),
    http.get('/api/trpc/sponsor.crm.activities.get', ({ request }) => {
      const url = new URL(request.url)
      const raw = url.searchParams.get('input')
      const input = raw ? (JSON.parse(raw) as { id: string }) : { id: '' }
      const item = items.find((i) => i._id === input.id)
      return HttpResponse.json({
        result: {
          data: {
            ...item,
            body: bodyHtml,
            attachments: [
              { label: 'Sponsor portal', url: 'https://example.com/portal' },
            ],
          },
        },
      })
    }),
  ]
}

const meta = {
  title: 'Systems/Sponsors/Admin/Pipeline/SponsorCommunicationsPanel',
  component: SponsorCommunicationsPanel,
  tags: ['autodocs'],
  beforeEach: () => {
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
    layout: 'padded',
    docs: {
      description: {
        component:
          "The Communications tab in the sponsor drawer (#1261): what the CRM's Send action sent, newest first, filterable by kind (contract, registration and discount sends join in #1262–#1264). Each line expands in place to the full record — recipients with role and default marker, subject, template and whether it was edited, provider id, and the body exactly as sent in a sandboxed frame. Failed sends are kept and marked.",
      },
    },
    msw: { handlers: handlersFor(all) },
  },
  args: {
    sponsorForConferenceId: 'sfc-123',
    onSend: fn(),
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SponsorCommunicationsPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Three sends: a successful one, a failed one, and a contract. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Information sent to Kari Nordmann (+1)')
    await expect(canvas.getByText('3 emails')).toBeInTheDocument()
    await expect(
      canvas.getByText('Information failed to send to Ola Nordmann'),
    ).toBeInTheDocument()
  },
}

/** Picking a kind narrows the list through the query, not in the page. */
export const FilterByKind: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('3 emails')
    await userEvent.click(canvas.getByRole('button', { name: 'Contract' }))
    await waitFor(() => expect(canvas.getByText('1 email')).toBeInTheDocument())
    await expect(
      canvas.getByText('Contract sent to Kari Nordmann'),
    ).toBeInTheDocument()
    await expect(
      canvas.queryByText('Information sent to Kari Nordmann (+1)'),
    ).not.toBeInTheDocument()
  },
}

/** Expanding a line loads the body on demand and shows the full record. */
export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Information sent to Kari Nordmann (+1)')
    // The body is not fetched until asked for.
    await expect(canvas.queryByTitle(/Email body/)).not.toBeInTheDocument()
    await userEvent.click(
      canvas.getAllByRole('button', { name: 'Show sent email' })[0],
    )
    const record = await canvas.findByTestId('communication-record')
    const r = within(record)
    await expect(r.getByText('kari@acme.example')).toBeInTheDocument()
    await expect(r.getByText('Default')).toBeInTheDocument()
    await expect(r.getByText('Edited before sending')).toBeInTheDocument()
    await expect(
      r.getByText('a1b2c3d4-0000-4000-8000-000000000001'),
    ).toBeInTheDocument()
    await r.findByTitle(/Email body/)
    await expect(r.getByText('Sponsor portal')).toBeInTheDocument()
  },
}

/** A failed send keeps its record, marked, with the provider's error. */
export const FailedExpanded: Story = {
  parameters: { msw: { handlers: handlersFor([all[1]]) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Information failed to send to Ola Nordmann')
    await userEvent.click(
      canvas.getByRole('button', { name: 'Show sent email' }),
    )
    await canvas.findByText('This email was not delivered.')
    await expect(
      canvas.getByText('Resend: domain not verified'),
    ).toBeInTheDocument()
  },
}

export const Empty: Story = {
  parameters: { msw: { handlers: handlersFor([]) } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Nothing sent yet')
    await userEvent.click(canvas.getByRole('button', { name: /Send an email/ }))
    await expect(args.onSend).toHaveBeenCalled()
  },
}

/** The first page fails: an alert with retry, never "Nothing sent yet". */
export const LoadError: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/sponsor.crm.activities.listCommunications', () =>
          HttpResponse.json(
            { error: { message: 'Failed to list sent emails', code: -32603 } },
            { status: 500 },
          ),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole('alert', undefined, { timeout: 10_000 })
    await expect(
      canvas.getByText('The sent emails could not be loaded.'),
    ).toBeInTheDocument()
    await expect(canvas.queryByText('Nothing sent yet')).not.toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
  },
}

export const Mobile: Story = {
  parameters: {
    layout: 'fullscreen',
    viewport: { value: 'mobile1', isRotated: false },
  },
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
}

export const DarkMode: Story = {
  parameters: { theme: 'dark' },
  decorators: [
    (Story) => (
      <div className="dark rounded-lg bg-gray-900 p-4">
        <Story />
      </div>
    ),
  ],
}
