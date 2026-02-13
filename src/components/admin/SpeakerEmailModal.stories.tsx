import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import { SpeakerEmailModal } from './SpeakerEmailModal'
import { NotificationProvider } from './NotificationProvider'
import { Status, Level, Format, Language } from '@/lib/proposal/types'

const mockProposal = {
  _id: 'proposal-1',
  _rev: 'rev-1',
  _type: 'talk',
  _createdAt: '2025-01-10T08:00:00Z',
  _updatedAt: '2025-01-15T12:00:00Z',
  title: 'Building Resilient Microservices with Kubernetes',
  description: [],
  outline: '',
  status: Status.accepted,
  format: Format.presentation_25,
  level: Level.intermediate,
  language: Language.english,
  speakers: [],
  audiences: [],
  tos: true,
  reviews: [],
  topics: [],
  conference: {
    _id: 'conf-1',
    _type: 'conference',
    _rev: 'rev-1',
    _createdAt: '2024-06-01T00:00:00Z',
    _updatedAt: '2024-06-01T00:00:00Z',
    title: 'Cloud Native Days Norway 2025',
    city: 'Bergen',
    country: 'Norway',
    startDate: '2025-06-12',
    endDate: '2025-06-12',
    socialLinks: [
      'https://twitter.com/cloudnativebrg',
      'https://linkedin.com/company/cloudnativebergen',
    ],
  } as never,
}

const singleSpeaker = [
  { id: 'speaker-1', name: 'Jane Doe', email: 'jane@example.com' },
]

const multipleSpeakers = [
  { id: 'speaker-1', name: 'Jane Doe', email: 'jane@example.com' },
  { id: 'speaker-2', name: 'John Smith', email: 'john@example.com' },
  { id: 'speaker-3', name: 'Alice Johnson', email: 'alice@example.com' },
]

const meta = {
  title: 'Systems/Speakers/Admin/SpeakerEmailModal',
  component: SpeakerEmailModal,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Email composition modal for sending messages to proposal speakers. Wraps the generic EmailModal with speaker-specific recipient display, greeting template, and SpeakerEmailTemplate preview. Sends via the `/admin/api/speakers/email/multi` endpoint.',
      },
    },
  },
  decorators: [
    (Story: React.ComponentType) => (
      <NotificationProvider>
        <Story />
      </NotificationProvider>
    ),
  ],
  args: {
    isOpen: true,
    onClose: fn(),
    fromEmail: 'conference@cloudnativebergen.no',
    domain: 'cloudnativedays.no',
  },
} satisfies Meta<typeof SpeakerEmailModal>

export default meta
type Story = StoryObj<typeof meta>

export const SingleSpeaker: Story = {
  args: {
    proposal: mockProposal,
    speakers: singleSpeaker,
  },
}

export const MultipleSpeakers: Story = {
  args: {
    proposal: mockProposal,
    speakers: multipleSpeakers,
  },
  parameters: {
    docs: {
      description: {
        story:
          'When multiple speakers are on a proposal, the greeting addresses all names and each recipient is shown as a badge.',
      },
    },
  },
}
