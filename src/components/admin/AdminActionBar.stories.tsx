import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AdminActionBar } from './AdminActionBar'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import type { Conference } from '@/lib/conference/types'
import { Speaker, Flags } from '@/lib/speaker/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'

const mockSpeakers: Speaker[] = [
  {
    _id: 'speaker-1',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    slug: 'alice-johnson',
    title: 'Senior Engineer',
    flags: [Flags.localSpeaker],
  },
]

const mockConference: Conference = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway 2026',
  organizer: 'Cloud Native Days Norway',
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

const mockProposal: ProposalExisting = {
  _id: 'proposal-1',
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  title: 'Building Scalable Kubernetes Applications',
  description: convertStringToPortableTextBlocks(
    'Learn how to build and deploy scalable applications on Kubernetes.',
  ),
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer],
  status: Status.submitted,
  outline: 'Introduction, Architecture, Demo, Q&A',
  topics: [],
  tos: true,
  speakers: mockSpeakers,
  conference: { _type: 'reference', _ref: 'conf-1' },
  reviews: [
    {
      _rev: '1',
      _id: 'review-1',
      _createdAt: '2024-01-02T00:00:00Z',
      _updatedAt: '2024-01-02T00:00:00Z',
      comment: 'Solid proposal.',
      score: { content: 4, relevance: 5, speaker: 4 },
      reviewer: { _type: 'reference', _ref: 'reviewer-1' },
      proposal: { _type: 'reference', _ref: 'proposal-1' },
    },
  ],
}

const meta = {
  title: 'Systems/Proposals/Admin/AdminActionBar',
  component: AdminActionBar,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Status/actions bar on the admin proposal detail page. Messaging M4: the 1:1 "Email" action is replaced by "Message", which posts into the proposal conversation thread (SendMessageModal).',
      },
    },
  },
  decorators: [
    (Story, ctx) => (
      <div className={ctx.parameters.dark ? 'dark bg-gray-950 p-4' : ''}>
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
} satisfies Meta<typeof AdminActionBar>

export default meta
type Story = StoryObj<typeof meta>

/** Submitted proposal: Edit / Preview / Message / Approve / Waitlist / Reject. */
export const Submitted: Story = {
  args: { proposal: mockProposal, conference: mockConference },
}

export const SubmittedDark: Story = {
  args: { proposal: mockProposal, conference: mockConference },
  parameters: { dark: true },
}

/** Accepted proposal: Confirm / Remind / Reject / Withdraw replace the triage actions. */
export const Accepted: Story = {
  args: {
    proposal: { ...mockProposal, status: Status.accepted },
    conference: mockConference,
  },
}
