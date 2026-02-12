import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalDetailsForm } from './ProposalDetailsForm'
import {
  Format,
  Language,
  Level,
  Audience,
  ProposalInput,
} from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'
import { Topic } from '@/lib/topic/types'
import { fn } from 'storybook/test'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'

const mockTopics: Topic[] = [
  {
    _id: 'topic-1',
    _type: 'topic',
    title: 'Kubernetes',
    color: '#326CE5',
    slug: { current: 'kubernetes' },
  },
  {
    _id: 'topic-2',
    _type: 'topic',
    title: 'DevOps',
    color: '#FF6B35',
    slug: { current: 'devops' },
  },
  {
    _id: 'topic-3',
    _type: 'topic',
    title: 'Security',
    color: '#E63946',
    slug: { current: 'security' },
  },
  {
    _id: 'topic-4',
    _type: 'topic',
    title: 'Observability',
    color: '#2A9D8F',
    slug: { current: 'observability' },
  },
]

const mockConference = {
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
  cfpEmail: 'cfp@cloudnativebergen.no',
  sponsorEmail: 'sponsors@cloudnativebergen.no',
  programDate: '2025-10-01',
  contactEmail: 'info@cloudnativebergen.no',
  registrationEnabled: true,
  domains: ['cloudnativedaybergen.no'],
  formats: [
    Format.lightning_10,
    Format.presentation_25,
    Format.presentation_45,
    Format.workshop_120,
  ],
  topics: mockTopics,
  organizers: [],
} as unknown as Conference

const emptyProposal: ProposalInput = {
  title: '',
  language: Language.norwegian,
  description: [],
  format: Format.lightning_10,
  level: Level.beginner,
  audiences: [],
  outline: '',
  topics: [],
  tos: false,
}

const filledProposal: ProposalInput = {
  title: 'Building Scalable Kubernetes Applications',
  language: Language.english,
  description: convertStringToPortableTextBlocks(
    'This talk explores modern approaches to building and deploying scalable applications on Kubernetes using platform engineering principles.',
  ),
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer, Audience.operator],
  outline:
    '1. Introduction (5 min)\n2. Challenges at Scale (10 min)\n3. Golden Paths (15 min)\n4. Demo (10 min)\n5. Q&A (5 min)',
  topics: [mockTopics[0], mockTopics[1]],
  tos: true,
}

const meta: Meta<typeof ProposalDetailsForm> = {
  title: 'Systems/Proposals/ProposalDetailsForm',
  component: ProposalDetailsForm,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Reusable form for creating and editing proposal details. Includes fields for title, language, abstract (rich text editor), format, level, audiences, topics, outline, and terms of service agreement. Supports a read-only mode for viewing submitted proposals.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl p-4">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ProposalDetailsForm>

export const Empty: Story = {
  args: {
    proposal: emptyProposal,
    setProposal: fn(),
    conference: mockConference,
    allowedFormats: [
      Format.lightning_10,
      Format.presentation_25,
      Format.presentation_45,
    ],
  },
}

export const PreFilled: Story = {
  args: {
    proposal: filledProposal,
    setProposal: fn(),
    conference: mockConference,
    allowedFormats: [
      Format.lightning_10,
      Format.presentation_25,
      Format.presentation_45,
      Format.workshop_120,
    ],
  },
}

export const ReadOnly: Story = {
  args: {
    proposal: filledProposal,
    setProposal: fn(),
    conference: mockConference,
    allowedFormats: [Format.presentation_45],
    readOnly: true,
  },
}

export const WorkshopFormat: Story = {
  args: {
    proposal: {
      ...filledProposal,
      title: 'Hands-on Kubernetes Security Workshop',
      format: Format.workshop_120,
      level: Level.advanced,
      audiences: [Audience.securityEngineer, Audience.operator],
      topics: [mockTopics[2]],
    },
    setProposal: fn(),
    conference: mockConference,
    allowedFormats: [Format.workshop_120],
  },
}
