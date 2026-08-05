import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ActivationHero } from './ActivationHero'
import {
  buildActivationChecklist,
  type ActivationOptions,
  type ConferenceForActivation,
} from '@/lib/settings/activation'
import { STARTER_SESSION_FORMATS } from '@/lib/onboarding/create'
import type { SystemCheck } from '@/lib/system-status/types'

/**
 * The activation hero that opens `/admin` while setup is incomplete (#839).
 * The stories call the REAL `buildActivationChecklist`, so the hero and the
 * derivation stay in lockstep — and so a story cannot show a step the real
 * checklist would never produce.
 */
const meta = {
  title: 'Systems/Admin/ActivationHero',
  component: ActivationHero,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
} satisfies Meta<typeof ActivationHero>

export default meta
type Story = StoryObj<typeof meta>

/** A shared-platform tenant: neither impossible row is theirs to complete. */
const SHARED_TENANT: ActivationOptions = {
  ticketingAvailable: false,
  emailDeliveryManagedByPlatform: true,
}

const emailOk: SystemCheck[] = [
  {
    id: 'email.resendKey',
    group: 'email',
    label: 'RESEND_API_KEY',
    status: 'ok',
  },
]

/** A brand-new conference exactly as provisioning creates it. */
const FRESH: ConferenceForActivation = {
  title: 'My New Conference',
  organizer: 'Acme Events',
  contactEmail: 'hello@acme.example',
  cfpEmail: 'hello@acme.example',
  sponsorEmail: 'hello@acme.example',
  formats: [...STARTER_SESSION_FORMATS],
  visibility: 'unlisted',
}

/** CFP stage cleared; the launch prep is what remains. */
const CFP_OPEN: ConferenceForActivation = {
  ...FRESH,
  cfpStartDate: '2026-01-01',
  cfpEndDate: '2026-03-01',
  topics: [{ _id: 't1', title: 'Kubernetes' }],
}

/** Everything but the switch. */
const NEARLY_LIVE: ConferenceForActivation = {
  ...CFP_OPEN,
  logoBright: 'https://cdn/logo.svg',
  venueName: 'Grieghallen',
  startDate: '2026-05-01',
  endDate: '2026-05-02',
  registrationLink: 'https://tickets.example.com',
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-5xl p-4">{children}</div>
}

function light(
  conference: ConferenceForActivation,
  checks: SystemCheck[] = [],
) {
  return {
    args: {
      checklist: buildActivationChecklist(conference, checks, SHARED_TENANT),
    },
    decorators: [
      (Story: React.ComponentType) => (
        <div className="min-h-screen bg-gray-50">
          <Frame>
            <Story />
          </Frame>
        </div>
      ),
    ],
  }
}

function dark(conference: ConferenceForActivation, checks: SystemCheck[] = []) {
  return {
    args: {
      checklist: buildActivationChecklist(conference, checks, SHARED_TENANT),
    },
    decorators: [
      (Story: React.ComponentType) => (
        <div className="dark min-h-screen bg-gray-950">
          <Frame>
            <Story />
          </Frame>
        </div>
      ),
    ],
  }
}

/** Day one: the two steps between this tenant and a proposal in the inbox. */
export const Fresh: Story = light(FRESH)

/** Part-done: the CFP can accept proposals, so the hero moves to launch prep. */
export const CfpOpen: Story = light(CFP_OPEN, emailOk)

/** One step left, and it is the switch itself. */
export const NearlyLive: Story = light(NEARLY_LIVE, emailOk)

export const FreshDark: Story = dark(FRESH)

export const NearlyLiveDark: Story = dark(NEARLY_LIVE, emailOk)
