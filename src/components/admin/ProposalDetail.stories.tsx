import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalDetail } from './ProposalDetail'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { Speaker, Flags } from '@/lib/speaker/types'
import { Topic } from '@/lib/topic/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'

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
]

const mockSpeaker = (
  overrides: Partial<Speaker> = {},
): Speaker & {
  bio?: string
  image?: string
  links?: string[]
  submittedTalks?: ProposalExisting[]
} => ({
  _id: 'speaker-1',
  _rev: '1',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  name: 'Alice Johnson',
  email: 'alice@example.com',
  slug: 'alice-johnson',
  title: 'Senior Platform Engineer at Google',
  bio: 'Alice is a senior platform engineer with 10 years of experience in cloud native technologies. She is a CNCF ambassador and regular conference speaker.',
  flags: [Flags.localSpeaker],
  links: [
    'https://github.com/alicejohnson',
    'https://linkedin.com/in/alicejohnson',
    'https://twitter.com/alicejohnson',
  ],
  ...overrides,
})

const createMockProposal = (
  overrides: Partial<ProposalExisting> = {},
): ProposalExisting => ({
  _id: 'proposal-1',
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-11-15T10:30:00Z',
  _updatedAt: '2024-11-20T14:45:00Z',
  title: 'Building Scalable Kubernetes Applications with Platform Engineering',
  description: convertStringToPortableTextBlocks(
    'This talk explores modern approaches to building and deploying scalable applications on Kubernetes using platform engineering principles. We cover internal developer platforms, golden paths, and how to balance developer freedom with operational excellence. Attendees will learn practical patterns for scaling their Kubernetes workloads while maintaining reliability and security.',
  ),
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer, Audience.operator],
  status: Status.submitted,
  outline:
    '1. Introduction to Platform Engineering (5 min)\n2. Kubernetes at Scale - Challenges (10 min)\n3. Building Golden Paths (15 min)\n4. Live Demo: IDP in Action (10 min)\n5. Q&A (5 min)',
  topics: mockTopics,
  tos: true,
  speakers: [mockSpeaker()],
  conference: { _type: 'reference', _ref: 'conf-1' },
  attachments: [],
  ...overrides,
})

const meta: Meta<typeof ProposalDetail> = {
  title: 'Systems/Proposals/Admin/ProposalDetail',
  component: ProposalDetail,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Full proposal detail view showing the title, description, outline, topics, speaker cards with bios and social links, other submissions by the same speaker, and a metadata sidebar with format, level, language, audience, and timestamps.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-6xl bg-white p-6 dark:bg-gray-900">
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ProposalDetail>

export const Default: Story = {
  args: {
    proposal: createMockProposal(),
  },
}

export const WithMultipleSpeakers: Story = {
  args: {
    proposal: createMockProposal({
      title: 'Co-presented: Kubernetes Multi-Cluster Strategies',
      speakers: [
        mockSpeaker(),
        mockSpeaker({
          _id: 'speaker-2',
          name: 'Bob Smith',
          email: 'bob@example.com',
          slug: 'bob-smith',
          title: 'DevOps Lead at Microsoft',
          bio: 'Bob leads the DevOps team at Microsoft Azure, focusing on container orchestration and developer experience tooling.',
          flags: [Flags.firstTimeSpeaker],
          links: ['https://github.com/bobsmith'],
        }),
      ],
    }),
  },
}

export const AcceptedProposal: Story = {
  args: {
    proposal: createMockProposal({
      status: Status.accepted,
      title: 'Advanced Service Mesh Deep Dive',
      format: Format.presentation_40,
      level: Level.advanced,
    }),
  },
}

export const LightningTalk: Story = {
  args: {
    proposal: createMockProposal({
      title: 'Quick Wins with eBPF',
      format: Format.lightning_10,
      level: Level.beginner,
      outline: 'A rapid overview of eBPF use cases in cloud native.',
      topics: [mockTopics[0]],
    }),
  },
}

export const Workshop: Story = {
  args: {
    proposal: createMockProposal({
      title: 'Hands-on Kubernetes Security Workshop',
      format: Format.workshop_120,
      level: Level.intermediate,
      audiences: [
        Audience.developer,
        Audience.operator,
        Audience.securityEngineer,
      ],
      outline:
        '1. Threat Modeling for K8s (20 min)\n2. Pod Security Standards (30 min)\n3. Network Policies Lab (30 min)\n4. Supply Chain Security (30 min)\n5. Wrap-up (10 min)',
    }),
  },
}

export const TravelFundingSpeaker: Story = {
  args: {
    proposal: createMockProposal({
      speakers: [
        mockSpeaker({
          flags: [Flags.requiresTravelFunding],
        }),
      ],
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows the travel funding warning icon when a speaker requires travel support.',
      },
    },
  },
}

export const NoDescription: Story = {
  args: {
    proposal: createMockProposal({
      title: 'Minimal Proposal',
      description: [],
      outline: '',
      topics: [],
      audiences: [],
    }),
  },
}

export const WithOtherSubmissions: Story = {
  args: {
    proposal: createMockProposal({
      speakers: [
        {
          ...mockSpeaker(),
          submittedTalks: [
            createMockProposal({
              _id: 'proposal-1',
              title:
                'Building Scalable Kubernetes Applications with Platform Engineering',
            }),
            createMockProposal({
              _id: 'proposal-other-1',
              title: 'GitOps for Platform Teams',
              status: Status.accepted,
              _createdAt: '2024-11-10T08:00:00Z',
            }),
            createMockProposal({
              _id: 'proposal-other-2',
              title: 'Introduction to Cilium',
              status: Status.submitted,
              _createdAt: '2024-11-12T09:00:00Z',
            }),
          ],
        } as unknown as Speaker,
      ],
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows the &quot;Other Submissions&quot; section when the speaker has additional proposals.',
      },
    },
  },
}
