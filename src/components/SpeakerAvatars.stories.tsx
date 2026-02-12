import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpeakerAvatars, SpeakerAvatarsWithNames } from './SpeakerAvatars'
import { Speaker, Flags } from '@/lib/speaker/types'

const mockSpeakers: Speaker[] = [
  {
    _id: 'speaker-1',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    slug: 'alice-johnson',
    title: 'Senior Engineer at Google',
    flags: [Flags.localSpeaker],
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
    flags: [Flags.firstTimeSpeaker],
  },
  {
    _id: 'speaker-3',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Carol Williams',
    email: 'carol@example.com',
    slug: 'carol-williams',
    title: 'Platform Architect at AWS',
    flags: [],
  },
  {
    _id: 'speaker-4',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'David Chen',
    email: 'david@example.com',
    slug: 'david-chen',
    title: 'CTO at Startup Inc',
    flags: [Flags.diverseSpeaker],
  },
  {
    _id: 'speaker-5',
    _rev: '1',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    name: 'Eva Martinez',
    email: 'eva@example.com',
    slug: 'eva-martinez',
    title: 'Principal Engineer at Netflix',
    flags: [],
  },
]

const meta: Meta<typeof SpeakerAvatars> = {
  title: 'Systems/Speakers/SpeakerAvatars',
  component: SpeakerAvatars,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Displays stacked speaker avatars with hover animation to spread them out. Uses MissingAvatar component when no image is available. Supports different sizes and configurable maximum visible count.',
      },
    },
  },
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size of the avatar stack',
    },
    maxVisible: {
      control: { type: 'number', min: 1, max: 5 },
      description: 'Maximum number of avatars visible before showing +N',
    },
    showTooltip: {
      control: 'boolean',
      description: 'Show speaker name on hover',
    },
  },
}

export default meta
type Story = StoryObj<typeof SpeakerAvatars>

export const SingleSpeaker: Story = {
  args: {
    speakers: [mockSpeakers[0]],
    size: 'md',
    maxVisible: 3,
    showTooltip: true,
  },
}

export const TwoSpeakers: Story = {
  args: {
    speakers: mockSpeakers.slice(0, 2),
    size: 'md',
    maxVisible: 3,
    showTooltip: true,
  },
}

export const ThreeSpeakers: Story = {
  args: {
    speakers: mockSpeakers.slice(0, 3),
    size: 'md',
    maxVisible: 3,
    showTooltip: true,
  },
}

export const ManySpeakers: Story = {
  args: {
    speakers: mockSpeakers,
    size: 'md',
    maxVisible: 3,
    showTooltip: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'When there are more speakers than maxVisible, shows a +N indicator.',
      },
    },
  },
}

export const SmallSize: Story = {
  args: {
    speakers: mockSpeakers.slice(0, 3),
    size: 'sm',
    maxVisible: 3,
    showTooltip: true,
  },
}

export const LargeSize: Story = {
  args: {
    speakers: mockSpeakers.slice(0, 3),
    size: 'lg',
    maxVisible: 3,
    showTooltip: true,
  },
}

export const AllSizes: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <p className="mb-2 text-sm font-medium text-gray-600">Small (sm)</p>
        <SpeakerAvatars
          speakers={mockSpeakers.slice(0, 3)}
          size="sm"
          maxVisible={3}
          showTooltip={true}
        />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-gray-600">Medium (md)</p>
        <SpeakerAvatars
          speakers={mockSpeakers.slice(0, 3)}
          size="md"
          maxVisible={3}
          showTooltip={true}
        />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-gray-600">Large (lg)</p>
        <SpeakerAvatars
          speakers={mockSpeakers.slice(0, 3)}
          size="lg"
          maxVisible={3}
          showTooltip={true}
        />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Comparison of all available avatar sizes. Hover over avatars to see the spread animation.',
      },
    },
  },
}

export const WithNames: Story = {
  render: () => (
    <div className="max-w-md space-y-4">
      <SpeakerAvatarsWithNames
        speakers={[mockSpeakers[0]]}
        size="md"
        maxVisible={3}
        showTooltip={true}
      />
      <SpeakerAvatarsWithNames
        speakers={mockSpeakers.slice(0, 2)}
        size="md"
        maxVisible={3}
        showTooltip={true}
      />
      <SpeakerAvatarsWithNames
        speakers={mockSpeakers.slice(0, 3)}
        size="md"
        maxVisible={3}
        showTooltip={true}
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: 'SpeakerAvatarsWithNames displays the avatar stack alongside formatted speaker names.',
      },
    },
  },
}
