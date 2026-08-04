import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { http, HttpResponse } from 'msw'
import { InvitationLettersPageClient } from './InvitationLettersPageClient'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import type { Conference } from '@/lib/conference/types'
import type { IssuedInvitationLetter } from '@/lib/invitation-letter/types'
import { Format } from '@/lib/proposal/types'

// Renders the real admin page against an msw-backed `invitationLetter.list`.
// The issue log deliberately shows no passport data — that is the feature, so
// the story is also the visual proof of it.

const conference: Conference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2026',
  organizer: 'Cloud Native Bergen',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2026-11-05',
  endDate: '2026-11-05',
  cfpStartDate: '2026-06-01',
  cfpEndDate: '2026-08-31',
  cfpNotifyDate: '2026-09-15',
  cfpEmail: 'cfp@cloudnativedays.no',
  sponsorEmail: 'sponsor@cloudnativedays.no',
  programDate: '2026-10-01',
  registrationEnabled: true,
  contactEmail: 'hello@cloudnativedays.no',
  organizers: [],
  domains: ['cloudnativedays.no'],
  formats: [Format.presentation_25, Format.presentation_45],
  topics: [],
}

const letters: IssuedInvitationLetter[] = [
  {
    _id: 'letter-1',
    reference: 'INV-2026-K7M2QP',
    recipientName: 'Amina Yusuf',
    recipientEmail: 'amina@example.com',
    participantRole: 'attendee',
    issuedAt: '2026-08-01T09:12:00Z',
    issuedBy: { _id: 'org-1', name: 'Hans Kristian Flaatten' },
    emailedTo: 'amina@example.com',
  },
  {
    _id: 'letter-2',
    reference: 'INV-2026-4RTX8B',
    recipientName: 'Chen Wei',
    recipientEmail: 'chen@example.com',
    participantRole: 'speaker',
    issuedAt: '2026-07-28T14:03:00Z',
    issuedBy: { _id: 'org-2', name: 'Programme Chair' },
  },
]

const listHandler = (data: IssuedInvitationLetter[]) =>
  http.get('/api/trpc/invitationLetter.list', () =>
    HttpResponse.json({ result: { data } }),
  )

const meta = {
  title: 'Systems/Participants/Admin/InvitationLetters',
  component: InvitationLettersPageClient,
  decorators: [
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    options: { showPanel: false },
    msw: { handlers: [listHandler(letters)] },
    docs: {
      description: {
        component:
          'Admin-only issuing of visa invitation letters. The organizer enters details the applicant sent them; the passport fields render into the PDF and are then discarded, so the issue log below records only that a letter was issued, to whom, and by which organizer.',
      },
    },
  },
  args: { conference },
} satisfies Meta<typeof InvitationLettersPageClient>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** First use: the form with nothing issued yet. */
export const NoLettersYet: Story = {
  parameters: { msw: { handlers: [listHandler([])] } },
}

/**
 * Arrived from an order on the tickets side. What the ticket knows is filled
 * in; everything a consulate checks against the passport is still blank, and
 * the banner says the seeded values are unverified.
 */
export const PrefilledFromOrder: Story = {
  args: {
    prefill: {
      fullName: 'Amina Yusuf',
      email: 'amina@example.com',
      registrationReference: '88912',
      organization: 'Example Bank Ltd',
      jobTitle: 'Software Engineer',
    },
  },
}
