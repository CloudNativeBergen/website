import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { http, HttpResponse } from 'msw'
import { SponsorAddModal } from './SponsorAddModal'
import type { SponsorTierExisting } from '@/lib/sponsor/types'
import { withPortalTheme } from '@/lib/storybook'
import { NotificationProvider } from '@/components/admin/NotificationProvider'

// Renders the REAL SponsorAddModal (not the previous static mock shell that
// duplicated the markup and drifted from production). It sits on the shared
// ModalShell. The existing-sponsor combobox reads `sponsor.list`; create/update
// flows use `sponsor.create|update` and `sponsor.crm.create|update`. The global
// TRPCDecorator provides the client; msw serves the sponsor list below.

const existingSponsors = [
  {
    _id: 'sponsor-1',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    name: 'TechGiant Corp',
    website: 'https://techgiant.example',
    logo: null,
    logoBright: null,
  },
  {
    _id: 'sponsor-2',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    name: 'CloudPro Inc',
    website: 'https://cloudpro.example',
    logo: null,
    logoBright: null,
  },
]

const handlers = [
  http.get('/api/trpc/sponsor.list', () =>
    HttpResponse.json({ result: { data: existingSponsors } }),
  ),
]

const tiers: SponsorTierExisting[] = [
  {
    _id: 'tier-1',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    title: 'Platinum',
    tagline: 'Top-level partnership',
    tierType: 'standard',
    price: [{ _key: 'p1', amount: 100000, currency: 'NOK' }],
    soldOut: false,
    mostPopular: true,
  },
  {
    _id: 'tier-2',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    title: 'Gold',
    tagline: 'Premium partnership',
    tierType: 'standard',
    price: [{ _key: 'p2', amount: 50000, currency: 'NOK' }],
    soldOut: false,
    mostPopular: false,
  },
  {
    _id: 'tier-3',
    _createdAt: '2026-01-01T00:00:00Z',
    _updatedAt: '2026-01-01T00:00:00Z',
    title: 'Silver',
    tagline: 'Supporting partnership',
    tierType: 'standard',
    price: [{ _key: 'p3', amount: 25000, currency: 'NOK' }],
    soldOut: false,
    mostPopular: false,
  },
]

const meta = {
  title: 'Systems/Sponsors/Admin/Pipeline/SponsorAddModal',
  component: SponsorAddModal,
  parameters: {
    layout: 'fullscreen',
    msw: { handlers },
    docs: {
      description: {
        component:
          'Modal for adding a sponsor to a conference: pick a tier, then select an existing sponsor from the database or create a new one inline (name, website, org number, logo). Built on the shared ModalShell. Inspect at 393px and in dark mode.',
      },
    },
  },
  args: {
    isOpen: true,
    conferenceId: 'conf-1',
    sponsorTiers: tiers,
    onClose: fn(),
    onSponsorAdded: fn(),
    onSponsorUpdated: fn(),
  },
  decorators: [
    withPortalTheme,
    // The real component surfaces submit errors via useNotification (batch C),
    // so the story must provide the NotificationProvider context.
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof SponsorAddModal>

export default meta
type Story = StoryObj<typeof meta>

/** Default add flow: tier select + existing-sponsor combobox. */
export const Default: Story = {}

/** A tier is preselected (e.g. opened from a specific tier row). */
export const WithPreselectedTier: Story = {
  args: { preselectedTierId: 'tier-2' },
}

/** Phone width — ModalShell presents the form as a bottom sheet. */
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
