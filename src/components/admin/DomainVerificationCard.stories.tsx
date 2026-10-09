import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { expect, within } from 'storybook/test'
import { DomainVerificationCard } from './DomainVerificationCard'
import { NotificationProvider } from './NotificationProvider'
import type { DomainVerificationView } from '@/lib/domain-verification'

/**
 * The /admin/settings "Domain Verification" card (#683). Every state an
 * organizer can land in gets a story, because the states differ only in copy
 * and colour — exactly the kind of thing that silently regresses.
 */

const TOKEN = 'konf-domain-verification=Kk3s9Xq2mVb7Ld0PnR4tYzA1cWgH6uEjS8fN'

function view(
  overrides: Partial<DomainVerificationView> = {},
): DomainVerificationView {
  const hostname = overrides.hostname ?? 'cloudnativebergen.dev'
  return {
    hostname,
    status: 'verified',
    grandfathered: false,
    platformOwned: false,
    graceUntil: null,
    // Derived exactly as `challengeRecordName` does, so the fixture cannot
    // drift from what the router actually hands the card.
    recordName: `_konf-challenge.${hostname.replace(/^\*\./, '')}`,
    recordValue: TOKEN,
    wildcard: false,
    devOnly: false,
    redirectAllowlisted: true,
    routable: true,
    lastCheckedAt: '2026-07-28T05:00:00.000Z',
    lastSuccessAt: '2026-07-28T05:00:00.000Z',
    lastError: null,
    workshopSignIn: null,
    ...overrides,
  }
}

const handlers = [
  http.post('/api/trpc/domainVerification.recheck', () =>
    HttpResponse.json({
      result: { data: { domain: view() } },
    }),
  ),
]

const meta = {
  title: 'Systems/Settings/Admin/DomainVerificationCard',
  component: DomainVerificationCard,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
  },
  args: { staticData: true },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <div className="mx-auto max-w-2xl bg-white p-4 dark:bg-gray-900">
          <Story />
        </div>
      </NotificationProvider>
    ),
  ],
} satisfies Meta<typeof DomainVerificationCard>

export default meta
type Story = StoryObj<typeof meta>

/** The healthy state: proven, on the redirect allowlist. */
export const Verified: Story = {
  args: { initialDomains: [view()] },
}

/** A brand-new claim: the record has been minted, DNS has not been published. */
export const AwaitingDns: Story = {
  args: {
    initialDomains: [
      view({
        hostname: 'oslo.cloudnativedays.no',
        status: 'pending',
        redirectAllowlisted: false,
        routable: false,
        lastCheckedAt: null,
        lastSuccessAt: null,
      }),
    ],
  },
}

/** The dangling-DNS state: the proof stopped resolving and the host was delisted. */
export const ProofMissing: Story = {
  args: {
    initialDomains: [
      view({
        hostname: 'kubeday-2024.example.no',
        status: 'failing',
        redirectAllowlisted: false,
        lastError:
          'No TXT record at _konf-challenge.kubeday-2024.example.no (ENOTFOUND)',
      }),
    ],
  },
}

/** A pre-existing claim admitted by the backfill, with its deadline showing. */
export const Grandfathered: Story = {
  args: {
    initialDomains: [
      view({
        hostname: 'cloudnativedays.no',
        grandfathered: true,
        graceUntil: '2026-08-27T00:00:00.000Z',
        lastError: 'No TXT record at _konf-challenge.cloudnativedays.no',
      }),
    ],
  },
}

/**
 * A subdomain the platform ALLOCATED to this conference: verified by
 * construction, no TXT record, no deadline and no "check now" — there is nothing
 * to check. (An in-zone host with no allocation never reaches this state; the
 * mutation refuses the claim outright.)
 */
export const PlatformOwned: Story = {
  args: {
    initialDomains: [
      view({
        hostname: 'kubeday.konf.run',
        platformOwned: true,
        recordName: null,
        recordValue: null,
      }),
    ],
  },
}

/** Every state at once, plus the wildcard and local-dev special cases. */
export const AllStates: Story = {
  args: {
    initialDomains: [
      view(),
      view({
        hostname: 'oslo.cloudnativedays.no',
        status: 'pending',
        redirectAllowlisted: false,
        routable: false,
        lastCheckedAt: null,
      }),
      view({
        hostname: 'kubeday-2024.example.no',
        status: 'failing',
        redirectAllowlisted: false,
        lastError: 'No TXT record (ENOTFOUND)',
      }),
      view({
        hostname: 'cloudnativedays.no',
        grandfathered: true,
        graceUntil: '2026-08-27T00:00:00.000Z',
      }),
      view({
        hostname: 'kubeday.konf.run',
        platformOwned: true,
        recordName: null,
        recordValue: null,
      }),
      view({
        hostname: '*.cloudnativedays.no',
        wildcard: true,
        redirectAllowlisted: false,
      }),
      view({
        hostname: 'localhost:3000',
        status: 'pending',
        devOnly: true,
        redirectAllowlisted: false,
        recordName: null,
        recordValue: null,
        lastCheckedAt: null,
        lastSuccessAt: null,
      }),
    ],
  },
}

/**
 * A conference WITH workshops (#1298): each host also says whether the
 * workshop portal can sign in on it, and why not. One host per state the
 * organizer can land in.
 */
const workshopSignInStates: DomainVerificationView[] = [
  view({
    hostname: '2026.cloudnativedays.no',
    workshopSignIn: { state: 'ready' },
  }),
  view({
    hostname: 'oslo.cloudnativedays.no',
    status: 'pending',
    redirectAllowlisted: false,
    routable: false,
    lastCheckedAt: null,
    lastSuccessAt: null,
    workshopSignIn: { state: 'unverified' },
  }),
  view({
    hostname: 'kubeday.konf.run',
    platformOwned: true,
    recordName: null,
    recordValue: null,
    workshopSignIn: { state: 'pending' },
  }),
  view({
    hostname: 'bergen.konf.run',
    platformOwned: true,
    recordName: null,
    recordValue: null,
    workshopSignIn: {
      state: 'failed',
      error:
        'WorkOS 422: redirect_uri https://bergen.konf.run/api/auth/callback is not a valid URI for this environment',
    },
  }),
  view({
    hostname: 'kubeday.example.no',
    workshopSignIn: { state: 'not-offered' },
  }),
]

export const WorkshopSignIn: Story = {
  args: { initialDomains: workshopSignInStates },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const label of [
      'available',
      'domain not verified',
      'registration pending',
      'registration failed',
      'not offered on this host',
    ]) {
      await expect(canvas.getByText(label)).toBeInTheDocument()
    }
    // The recorded error is shown verbatim, to the organizer only.
    await expect(canvas.getByText(/WorkOS 422/)).toBeInTheDocument()
  },
}

export const WorkshopSignInDark: Story = {
  args: { initialDomains: workshopSignInStates },
  globals: { theme: 'dark' },
}

export const WorkshopSignInMobile: Story = {
  args: { initialDomains: workshopSignInStates },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    // The long error must wrap, not widen the page.
    const page = canvasElement.ownerDocument.documentElement
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth)
  },
}

/** No domains claimed yet. */
export const Empty: Story = {
  args: { initialDomains: [] },
}
