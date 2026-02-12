import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { SpeakerTable } from './SpeakerTable'
import { Speaker, Flags } from '@/lib/speaker/types'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'

interface SpeakerWithProposals extends Speaker {
  proposals: ProposalExisting[]
}

const mockTopic = { _type: 'reference' as const, _ref: 'topic-1' }

const mockProposal = (
  id: string,
  title: string,
  status: Status,
  format: Format = Format.presentation_45,
): ProposalExisting => ({
  _id: id,
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  title,
  description: convertStringToPortableTextBlocks('Test description'),
  language: Language.english,
  format,
  level: Level.intermediate,
  audiences: [Audience.developer],
  status,
  outline: '',
  topics: [mockTopic],
  tos: true,
  speakers: [],
  conference: { _id: 'conf-2025', _ref: 'conf-2025', _type: 'reference' },
})

const mockSpeakers: SpeakerWithProposals[] = [
  {
    _id: 'speaker-1',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    slug: 'alice-johnson',
    title: 'Senior Platform Engineer at Google',
    flags: [Flags.localSpeaker],
    links: [
      'https://linkedin.com/in/alicejohnson',
      'https://bsky.app/profile/alice.dev',
    ],
    proposals: [
      mockProposal(
        'talk-1',
        'Building Scalable Microservices with Kubernetes',
        Status.confirmed,
      ),
    ],
  },
  {
    _id: 'speaker-2',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Bob Smith',
    email: 'bob@example.com',
    slug: 'bob-smith',
    title: 'DevOps Lead at Microsoft',
    flags: [Flags.firstTimeSpeaker, Flags.diverseSpeaker],
    links: ['https://linkedin.com/in/bobsmith'],
    proposals: [
      mockProposal('talk-2', 'GitOps for the Enterprise', Status.accepted),
      mockProposal(
        'talk-3',
        'Advanced CI/CD Patterns',
        Status.submitted,
        Format.lightning_10,
      ),
    ],
  },
  {
    _id: 'speaker-3',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Carol Williams',
    email: 'carol@cloudprovider.io',
    slug: 'carol-williams',
    title: 'Principal Solutions Architect, AWS',
    flags: [Flags.requiresTravelFunding],
    links: ['https://bsky.app/profile/carol.codes'],
    proposals: [
      mockProposal(
        'talk-4',
        'Hands-on Kubernetes Workshop',
        Status.confirmed,
        Format.workshop_120,
      ),
    ],
  },
  {
    _id: 'speaker-4',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'David Chen',
    email: 'david@startup.io',
    slug: 'david-chen',
    title: 'CTO at CloudStartup',
    flags: [],
    links: [],
    proposals: [
      mockProposal(
        'talk-5',
        'From Zero to Production: A Startup Journey',
        Status.accepted,
      ),
    ],
  },
]

const meta = {
  title: 'Admin/Speakers/SpeakerTable',
  component: SpeakerTable,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Admin table for managing speakers with accepted/confirmed talks. Features search, filtering by status and speaker flags, configurable column visibility, and action menus for editing and previewing speaker profiles.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SpeakerTable>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    speakers: mockSpeakers,
    currentConferenceId: 'conf-2025',
    onEditSpeaker: fn(),
    onPreviewSpeaker: fn(),
  },
}

export const Empty: Story = {
  args: {
    speakers: [],
    currentConferenceId: 'conf-2025',
    onEditSpeaker: fn(),
    onPreviewSpeaker: fn(),
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows empty state when no speakers with accepted talks exist.',
      },
    },
  },
}

export const SingleSpeaker: Story = {
  args: {
    speakers: [mockSpeakers[0]],
    currentConferenceId: 'conf-2025',
    onEditSpeaker: fn(),
    onPreviewSpeaker: fn(),
  },
}

export const ManySpeakers: Story = {
  args: {
    speakers: [
      ...mockSpeakers,
      {
        _id: 'speaker-5',
        _rev: '1',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        name: 'Eva Martinez',
        email: 'eva@tech.com',
        slug: 'eva-martinez',
        title: 'Staff Engineer at Netflix',
        flags: [Flags.localSpeaker, Flags.diverseSpeaker],
        links: ['https://linkedin.com/in/evamartinez'],
        proposals: [
          mockProposal('talk-6', 'Observability at Scale', Status.confirmed),
        ],
      },
      {
        _id: 'speaker-6',
        _rev: '1',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        name: 'Frank Thompson',
        email: 'frank@consultancy.com',
        slug: 'frank-thompson',
        title: 'Independent Consultant',
        flags: [Flags.firstTimeSpeaker, Flags.requiresTravelFunding],
        links: [],
        proposals: [
          mockProposal('talk-7', 'Service Mesh Deep Dive', Status.accepted),
        ],
      },
    ],
    currentConferenceId: 'conf-2025',
    onEditSpeaker: fn(),
    onPreviewSpeaker: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Table with many speakers showing various flags and proposal statuses.',
      },
    },
  },
}

export const WithoutConferenceFilter: Story = {
  args: {
    speakers: mockSpeakers,
    currentConferenceId: undefined,
    onEditSpeaker: fn(),
    onPreviewSpeaker: fn(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Without a currentConferenceId, all proposals from all conferences are shown.',
      },
    },
  },
}
