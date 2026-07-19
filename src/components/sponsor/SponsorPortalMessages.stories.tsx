import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse, delay } from 'msw'
import { SponsorPortalMessages } from './SponsorPortalMessages'

/**
 * The sponsor-side message thread on the portal (messaging G2b). Token-authed via
 * the public `sponsorMessages` router. These stories mock that router with MSW.
 */
const meta = {
  title: 'Systems/Sponsors/Portal/SponsorPortalMessages',
  component: SponsorPortalMessages,
  parameters: { layout: 'padded' },
  decorators: [
    // Apply `.dark` at the outermost node (via `parameters.dark`) so every
    // `dark:` variant inside activates for the dark capture.
    (Story, ctx) => (
      <div className={ctx.parameters.dark ? 'dark bg-gray-950 p-4' : ''}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SponsorPortalMessages>

export default meta
type Story = StoryObj<typeof meta>

function trpcResponse(data: unknown) {
  return { result: { data } }
}

// Server returns newest-first (the component reverses for display).
const thread = {
  sponsorName: 'Acme Corp',
  subject: 'Acme Corp',
  contactNames: ['Dana Diaz', 'Sam Stone'],
  messages: [
    {
      _id: 'm3',
      body: 'Perfect, thank you! We will send the artwork by Friday.',
      createdAt: '2026-07-01T12:00:00Z',
      authorName: 'Dana Diaz',
      fromSponsor: true,
    },
    {
      _id: 'm2',
      body: 'The standard booth is 3×2m with two power sockets — full spec sheet on its way to your inbox.',
      createdAt: '2026-07-01T11:00:00Z',
      authorName: null,
      fromSponsor: false,
    },
    {
      _id: 'm1',
      body: 'Hi! Could you confirm the booth dimensions and power supply for our stand?',
      createdAt: '2026-07-01T10:00:00Z',
      authorName: 'Dana Diaz',
      fromSponsor: true,
    },
  ],
}

const handlers = [
  http.get('/api/trpc/sponsorMessages.list', () =>
    HttpResponse.json(trpcResponse(thread)),
  ),
  http.post('/api/trpc/sponsorMessages.send', async () => {
    await delay(500)
    return HttpResponse.json(
      trpcResponse({
        message: {
          _id: 'm4',
          body: 'Sent!',
          createdAt: '2026-07-01T13:00:00Z',
          authorName: 'Dana Diaz',
          fromSponsor: true,
        },
      }),
    )
  }),
]

const empty = { ...thread, messages: [] }

/** Card variant (as rendered on the portal STATUS DASHBOARD). */
export const DashboardCard: Story = {
  args: { token: 'valid' },
  parameters: { msw: { handlers } },
  render: (args) => (
    <div className="mx-auto max-w-3xl">
      <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Messages
        </h2>
        <p className="mt-1 mb-4 text-sm text-gray-600 dark:text-gray-400">
          Questions about your sponsorship? Message the organizers here.
        </p>
        <SponsorPortalMessages {...args} />
      </section>
    </div>
  ),
}

export const DashboardCardDark: Story = {
  ...DashboardCard,
  parameters: { msw: { handlers }, dark: true },
}

/** Disclosure variant (as rendered below the registration FORM). */
export const FormDisclosure: Story = {
  args: { token: 'valid' },
  parameters: { msw: { handlers } },
  render: (args) => (
    <div className="mx-auto max-w-3xl">
      <details
        open
        className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
      >
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-900 select-none dark:text-white">
          Message the organizers
        </summary>
        <div className="border-t border-gray-200 p-4 dark:border-gray-700">
          <SponsorPortalMessages {...args} />
        </div>
      </details>
    </div>
  ),
}

/** Empty thread (no messages posted yet). */
export const EmptyThread: Story = {
  args: { token: 'valid' },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/sponsorMessages.list', () =>
          HttpResponse.json(trpcResponse(empty)),
        ),
      ],
    },
  },
  render: (args) => (
    <div className="mx-auto max-w-3xl">
      <SponsorPortalMessages {...args} />
    </div>
  ),
}
