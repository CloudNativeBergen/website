import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ActivationChecklist } from './ActivationChecklist'
import {
  buildActivationChecklist,
  type ConferenceForActivation,
} from '@/lib/settings/activation'
import { STARTER_SESSION_FORMATS } from '@/lib/onboarding/create'
import type { SystemCheck } from '@/lib/system-status/types'

/**
 * The "Get started" onboarding checklist, rendered from three representative
 * derivation states. The stories call the REAL `buildActivationChecklist` so the
 * card and the derivation stay in lockstep.
 */
const meta = {
  title: 'Systems/Admin/Settings/ActivationChecklist',
  component: ActivationChecklist,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof ActivationChecklist>

export default meta
type Story = StoryObj<typeof meta>

const emailOk: SystemCheck[] = [
  {
    id: 'email.resendKey',
    group: 'email',
    label: 'RESEND_API_KEY',
    status: 'ok',
  },
]
const emailAndSlackOk: SystemCheck[] = [
  ...emailOk,
  {
    id: 'slack.botToken',
    group: 'slack',
    label: 'SLACK_BOT_TOKEN',
    status: 'ok',
  },
]

/**
 * A brand-new, unlisted conference EXACTLY as provisioning creates it — almost
 * nothing configured, except the starter session formats
 * (`@/lib/onboarding/create.ts`). That one row therefore starts ticked, with the
 * advisory note that says whose choice it was.
 */
const FRESH: ConferenceForActivation = {
  title: 'My New Conference',
  organizer: 'Acme Events',
  formats: [...STARTER_SESSION_FORMATS],
  visibility: 'unlisted',
}

/** Everything required except the final Go-live switch. */
const NEARLY_DONE: ConferenceForActivation = {
  title: 'Cloud Native Day',
  organizer: 'Cloud Native Bergen',
  logoBright: 'https://cdn/logo.svg',
  venueName: 'Grieghallen',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
  cfpStartDate: '2026-01-01',
  cfpEndDate: '2026-03-01',
  formats: ['lightning_10', 'presentation_25'],
  topics: [{ _id: 't1', title: 'Kubernetes' }],
  contactEmail: 'hi@example.com',
  cfpEmail: 'cfp@example.com',
  sponsorEmail: 'sponsors@example.com',
  registrationLink: 'https://tickets.example.com',
  ticketingProvider: 'checkin',
  checkinCustomerId: 123,
  checkinEventId: 456,
  visibility: 'unlisted',
  domains: ['foo.cloudnativebergen.dev'],
}

/** Fully configured and live — the card collapses to a compact header. */
const ALL_DONE: ConferenceForActivation = {
  ...NEARLY_DONE,
  visibility: 'live',
  domains: ['cloudnativeday.example', 'foo.cloudnativebergen.dev'],
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-3xl p-4">{children}</div>
}

export const Fresh: Story = {
  args: { checklist: buildActivationChecklist(FRESH, []) },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-gray-50">
        <Frame>
          <Story />
        </Frame>
      </div>
    ),
  ],
}

/**
 * The SHARED-PLATFORM tenant (#839): it has no `ticketing` entitlement and the
 * Resend key is a platform environment variable it cannot see. Both rows stay
 * listed but are badged as not theirs and dropped from the progress rollup — a
 * checklist that asks for the impossible teaches the organizer to ignore it.
 */
export const SharedPlatformTenant: Story = {
  args: {
    checklist: buildActivationChecklist(FRESH, [], {
      ticketingAvailable: false,
      emailDeliveryManagedByPlatform: true,
    }),
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-gray-50">
        <Frame>
          <Story />
        </Frame>
      </div>
    ),
  ],
}

export const NearlyDone: Story = {
  args: { checklist: buildActivationChecklist(NEARLY_DONE, emailOk) },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-gray-50">
        <Frame>
          <Story />
        </Frame>
      </div>
    ),
  ],
}

export const AllDone: Story = {
  args: { checklist: buildActivationChecklist(ALL_DONE, emailAndSlackOk) },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-gray-50">
        <Frame>
          <Story />
        </Frame>
      </div>
    ),
  ],
}

export const FreshDark: Story = {
  args: { checklist: buildActivationChecklist(FRESH, []) },
  decorators: [
    (Story) => (
      <div className="dark min-h-screen bg-gray-950">
        <Frame>
          <Story />
        </Frame>
      </div>
    ),
  ],
}

export const NearlyDoneDark: Story = {
  args: { checklist: buildActivationChecklist(NEARLY_DONE, emailOk) },
  decorators: [
    (Story) => (
      <div className="dark min-h-screen bg-gray-950">
        <Frame>
          <Story />
        </Frame>
      </div>
    ),
  ],
}
