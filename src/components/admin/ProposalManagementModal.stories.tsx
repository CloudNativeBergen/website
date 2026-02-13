import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalManagementModal } from './ProposalManagementModal'
import { NotificationProvider } from '@/components/admin/NotificationProvider'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'
import { Speaker } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import { fn } from 'storybook/test'

const mockTopics: Topic[] = [
  {
    _id: 'topic-1',
    _type: 'topic',
    title: 'Kubernetes',
    color: '326CE5',
    slug: { current: 'kubernetes' },
  },
  {
    _id: 'topic-2',
    _type: 'topic',
    title: 'DevOps',
    color: 'FF6B35',
    slug: { current: 'devops' },
  },
  {
    _id: 'topic-3',
    _type: 'topic',
    title: 'Security',
    color: 'E91E63',
    slug: { current: 'security' },
  },
  {
    _id: 'topic-4',
    _type: 'topic',
    title: 'Observability',
    color: '4CAF50',
    slug: { current: 'observability' },
  },
]

const mockConference: Conference = {
  _id: 'conf-1',
  title: 'Cloud Native Day Bergen 2025',
  organizer: 'Cloud Native Bergen',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2025-11-05',
  endDate: '2025-11-05',
  cfpStartDate: '2025-06-01',
  cfpEndDate: '2025-08-31',
  cfpNotifyDate: '2025-09-15',
  cfpEmail: 'cfp@cloudnativeday.no',
  sponsorEmail: 'sponsor@cloudnativeday.no',
  programDate: '2025-10-01',
  registrationEnabled: true,
  contactEmail: 'hello@cloudnativeday.no',
  organizers: [],
  domains: ['cloudnativeday.no'],
  formats: [
    Format.lightning_10,
    Format.presentation_20,
    Format.presentation_40,
    Format.presentation_45,
    Format.workshop_120,
  ],
  topics: mockTopics,
}

const mockSpeaker: Speaker = {
  _id: 'speaker-1',
  _rev: '1',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  name: 'Alice Johnson',
  email: 'alice@example.com',
  slug: 'alice-johnson',
}

const mockEditingProposal: ProposalExisting = {
  _id: 'proposal-1',
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-11-15T10:30:00Z',
  _updatedAt: '2024-11-20T14:45:00Z',
  title: 'Building Scalable Kubernetes Applications',
  description: convertStringToPortableTextBlocks(
    'Learn how to build and deploy scalable applications on Kubernetes.',
  ),
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer, Audience.operator],
  status: Status.submitted,
  outline: 'Intro, Architecture, Demo, Q&A',
  topics: [mockTopics[0], mockTopics[1]],
  tos: true,
  speakers: [mockSpeaker],
  conference: { _type: 'reference', _ref: 'conf-1' },
}

const meta: Meta<typeof ProposalManagementModal> = {
  title: 'Systems/Proposals/Admin/ProposalManagementModal',
  component: ProposalManagementModal,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'A full-featured modal for creating or editing proposals from the admin interface. Includes speaker multi-select, the shared ProposalDetailsForm (title, description, format, level, audience, topics, outline), validation errors, and keyboard shortcuts (Cmd+S to save).',
      },
    },
  },
  decorators: [
    (Story) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ProposalManagementModal>

export const CreateNew: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    conference: mockConference,
    onProposalCreated: fn(),
  },
}

export const EditExisting: Story = {
  args: {
    isOpen: true,
    onClose: fn(),
    editingProposal: mockEditingProposal,
    conference: mockConference,
    onProposalUpdated: fn(),
  },
}

export const Closed: Story = {
  args: {
    isOpen: false,
    onClose: fn(),
    conference: mockConference,
  },
}
