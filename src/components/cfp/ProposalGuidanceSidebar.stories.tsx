import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalGuidanceSidebar } from './ProposalGuidanceSidebar'
import { Conference } from '@/lib/conference/types'
import { Format } from '@/lib/proposal/types'
import { Topic } from '@/lib/topic/types'

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
    title: 'Cloud Native',
    color: '#0091DA',
    slug: { current: 'cloud-native' },
  },
  {
    _id: 'topic-3',
    _type: 'topic',
    title: 'DevOps',
    color: '#FF6B6B',
    slug: { current: 'devops' },
  },
  {
    _id: 'topic-4',
    _type: 'topic',
    title: 'Security',
    color: '#4ECDC4',
    slug: { current: 'security' },
  },
  {
    _id: 'topic-5',
    _type: 'topic',
    title: 'Observability',
    color: '#FFE66D',
    slug: { current: 'observability' },
  },
  {
    _id: 'topic-6',
    _type: 'topic',
    title: 'Platform Engineering',
    color: '#95D5B2',
    slug: { current: 'platform-engineering' },
  },
]

const createMockConference = (
  overrides: Partial<Conference> = {},
): Conference => ({
  _id: 'conf-2025',
  title: 'Cloud Native Days Norway 2025',
  organizer: 'Cloud Native Days Norway',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2025-09-18',
  endDate: '2025-09-18',
  cfpStartDate: '2025-03-01',
  cfpEndDate: '2025-06-15',
  cfpNotifyDate: '2025-07-01',
  cfpEmail: 'cfp@cloudnativedays.no',
  sponsorEmail: 'sponsor@cloudnativedays.no',
  programDate: '2025-07-15',
  contactEmail: 'info@cloudnativedays.no',
  registrationEnabled: true,
  organizers: [],
  domains: ['cloudnativedays.no'],
  formats: [
    Format.lightning_10,
    Format.presentation_25,
    Format.presentation_45,
    Format.workshop_120,
  ],
  topics: mockTopics,
  ...overrides,
})

const meta = {
  title: 'Systems/Proposals/ProposalGuidanceSidebar',
  component: ProposalGuidanceSidebar,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A sidebar component displayed alongside the proposal form, showing important CFP dates, submission tips, accepted formats, and topics of interest.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProposalGuidanceSidebar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    conference: createMockConference(),
  },
}

export const MultiDayConference: Story = {
  args: {
    conference: createMockConference({
      title: 'Cloud Native Days Norway 2025',
      startDate: '2025-09-18',
      endDate: '2025-09-19',
    }),
  },
}

export const ManyTopics: Story = {
  args: {
    conference: createMockConference({
      topics: [
        ...mockTopics,
        {
          _id: 'topic-7',
          _type: 'topic',
          title: 'GitOps',
          color: '#FC5185',
          slug: { current: 'gitops' },
        },
        {
          _id: 'topic-8',
          _type: 'topic',
          title: 'Service Mesh',
          color: '#3FC1C9',
          slug: { current: 'service-mesh' },
        },
        {
          _id: 'topic-9',
          _type: 'topic',
          title: 'Serverless',
          color: '#F5B461',
          slug: { current: 'serverless' },
        },
        {
          _id: 'topic-10',
          _type: 'topic',
          title: 'AI/ML',
          color: '#A855F7',
          slug: { current: 'ai-ml' },
        },
      ],
    }),
  },
}

export const NoTopics: Story = {
  args: {
    conference: createMockConference({
      topics: [],
    }),
  },
}

export const MinimalFormats: Story = {
  args: {
    conference: createMockConference({
      formats: [Format.presentation_25],
      topics: mockTopics.slice(0, 3),
    }),
  },
}

export const NoCfpEmail: Story = {
  args: {
    conference: createMockConference({
      cfpEmail: '',
    }),
  },
}

export const AllFormats: Story = {
  args: {
    conference: createMockConference({
      formats: [
        Format.lightning_10,
        Format.presentation_20,
        Format.presentation_25,
        Format.presentation_40,
        Format.presentation_45,
        Format.workshop_120,
        Format.workshop_240,
      ],
    }),
  },
}
