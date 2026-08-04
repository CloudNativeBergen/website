import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { within, userEvent, expect } from 'storybook/test'
import { OnboardingWizard } from './OnboardingWizard'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type { OrganizerState, WizardState } from './wizardLogic'

const filledOrganization: WizardState['organization'] = {
  name: 'Cloud Native Oslo',
  slug: '',
  slugTouched: false,
  contactEmail: 'hello@cloudnativeoslo.no',
  billingEmail: '',
}

const filledConference: WizardState['conference'] = {
  title: 'Cloud Native Days Oslo 2027',
  city: 'Oslo',
  country: 'Norway',
  startDate: '2027-06-01',
  endDate: '2027-06-02',
}

const organizer: OrganizerState = {
  name: 'Kari Nordmann',
  email: 'kari@cloudnativeoslo.no',
}

// Happy path: slug/domains free, organizer email matches one existing account.
const handlers = [
  http.get('/api/trpc/onboarding.validateSetup', () =>
    HttpResponse.json({
      result: {
        data: {
          slugTaken: false,
          takenDomains: [],
          organizer: { matchCount: 1, match: { name: 'Kari Nordmann' } },
        },
      },
    }),
  ),
  http.post('/api/trpc/onboarding.createOrganization', () =>
    HttpResponse.json({
      result: {
        data: {
          organizationId: 'organization-abc123',
          conferenceId: 'conference-def456',
          speakerId: 'speaker-xyz',
          speakerCreated: false,
          organizerMatchedName: 'Kari Nordmann',
          // Domain ownership is CLAIMED, not proven, at hand-off (#683).
          challenges: [
            {
              hostname: 'oslo.cloudnativedays.no',
              status: 'pending',
              grandfathered: false,
              graceUntil: null,
              recordName: '_konf-challenge.oslo.cloudnativedays.no',
              recordValue:
                'konf-domain-verification=Kk3s9Xq2mVb7Ld0PnR4tYzA1cWgH6uEjS8fN',
              wildcard: false,
              devOnly: false,
              redirectAllowlisted: false,
              routable: false,
              lastCheckedAt: null,
              lastSuccessAt: null,
              lastError: null,
            },
          ],
        },
      },
    }),
  ),
]

const meta = {
  title: 'Systems/Admin/Platform/Onboarding Wizard',
  component: OnboardingWizard,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <div className="mx-auto max-w-3xl p-4">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
} satisfies Meta<typeof OnboardingWizard>

export default meta
type Story = StoryObj<typeof meta>

/** Step 1 — Organization details + the founding organizer, blank start. */
export const Organization: Story = {
  args: { initialStep: 'organization' },
}

/** Step 1 filled — auto-derived slug and an existing-account match. */
export const OrganizationFilled: Story = {
  args: {
    initialStep: 'organization',
    initialState: { organization: filledOrganization },
    initialOrganizer: organizer,
  },
  play: async ({ canvas }) => {
    // The slug derives from the name until hand-edited.
    const slugInput = canvas.getByPlaceholderText('example-conference')
    await expect(slugInput).toHaveValue('cloud-native-oslo')
  },
}

/** Step 2 — First conference basics (dates optional). */
export const Conference: Story = {
  args: {
    initialStep: 'conference',
    initialState: {
      organization: filledOrganization,
      conference: filledConference,
    },
    initialOrganizer: organizer,
  },
}

/** Step 3 — Domains, explicitly optional (tenants can start on none). */
export const Domains: Story = {
  args: {
    initialStep: 'domains',
    initialState: {
      organization: filledOrganization,
      conference: filledConference,
      domains: ['oslo.cloudnativedays.no'],
    },
    initialOrganizer: organizer,
  },
}

/** Step 4 — Review with the Create button armed. */
export const Review: Story = {
  args: {
    initialStep: 'review',
    initialState: {
      organization: filledOrganization,
      conference: filledConference,
      domains: ['oslo.cloudnativedays.no'],
    },
    initialOrganizer: organizer,
  },
}

/** Done — the handoff screen after a successful creation (with a domain). */
export const Done: Story = {
  args: {
    initialStep: 'review',
    initialState: {
      organization: filledOrganization,
      conference: filledConference,
      domains: ['oslo.cloudnativedays.no'],
    },
    initialOrganizer: organizer,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByRole('button', { name: /create organization/i }),
    )
    await expect(
      await canvas.findByText(/is on board/i, undefined, { timeout: 5000 }),
    ).toBeVisible()
    // The hand-off must hand the operator the proof to publish.
    await expect(
      await canvas.findByText(/prove domain ownership/i),
    ).toBeVisible()
  },
}

/** Step validation — an empty Organization step cannot advance. */
export const OrganizationValidation: Story = {
  args: { initialStep: 'organization' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const next = await canvas.findByRole('button', { name: /next/i })
    await expect(next).toBeDisabled()
  },
}

/**
 * Ambiguity gate — an organizer email matching SEVERAL speaker accounts is a
 * deterministic server rejection, so the step blocks (not just warns) until
 * the duplicates are merged.
 */
export const OrganizationAmbiguousOrganizer: Story = {
  args: {
    initialStep: 'organization',
    initialState: { organization: filledOrganization },
    initialOrganizer: organizer,
  },
  parameters: {
    msw: {
      handlers: [
        http.get('/api/trpc/onboarding.validateSetup', () =>
          HttpResponse.json({
            result: {
              data: {
                slugTaken: false,
                takenDomains: [],
                organizer: { matchCount: 2, match: null },
              },
            },
          }),
        ),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText(/matches several speaker accounts/i, undefined, {
      timeout: 5000,
    })
    await expect(
      await canvas.findByRole('button', { name: /next/i }),
    ).toBeDisabled()
  },
}
