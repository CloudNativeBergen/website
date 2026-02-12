import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ClickableSpeakerNames } from './ClickableSpeakerNames'
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
]

const meta = {
  title: 'Systems/Speakers/ClickableSpeakerNames',
  component: ClickableSpeakerNames,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Renders speaker names as clickable links to their profile pages. Handles multiple speakers with proper separators (commas and ampersands). Supports first name only mode for compact displays and a maxVisible option to limit displayed names.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="text-gray-900 dark:text-white">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    showFirstNameOnly: {
      control: 'boolean',
      description: 'Show only first names when multiple speakers',
    },
    maxVisible: {
      control: { type: 'number', min: 1, max: 10 },
      description: 'Maximum number of names to display',
    },
  },
} satisfies Meta<typeof ClickableSpeakerNames>

export default meta
type Story = StoryObj<typeof meta>

export const SingleSpeaker: Story = {
  args: {
    speakers: [mockSpeakers[0]],
  },
}

export const TwoSpeakers: Story = {
  args: {
    speakers: mockSpeakers.slice(0, 2),
  },
  parameters: {
    docs: {
      description: {
        story: 'Two speakers are joined with an ampersand (&).',
      },
    },
  },
}

export const ThreeSpeakers: Story = {
  args: {
    speakers: mockSpeakers.slice(0, 3),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Multiple speakers use commas with an ampersand before the last name.',
      },
    },
  },
}

export const ManySpeakers: Story = {
  args: {
    speakers: mockSpeakers,
  },
}

export const FirstNameOnly: Story = {
  args: {
    speakers: mockSpeakers.slice(0, 3),
    showFirstNameOnly: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Useful for compact displays where full names would be too long.',
      },
    },
  },
}

export const MaxVisible: Story = {
  args: {
    speakers: mockSpeakers,
    maxVisible: 2,
  },
  parameters: {
    docs: {
      description: {
        story: 'Limits displayed names and shows "+N more" for remaining.',
      },
    },
  },
}

export const CustomStyling: Story = {
  args: {
    speakers: mockSpeakers.slice(0, 2),
    className: 'text-lg font-semibold',
    linkClassName:
      'text-brand-cloud-blue hover:text-brand-cloud-blue/80 hover:underline',
    separatorClassName: 'text-gray-400',
  },
  parameters: {
    docs: {
      description: {
        story: 'Custom CSS classes can be applied to links and separators.',
      },
    },
  },
}

export const InContext: Story = {
  args: {
    speakers: mockSpeakers,
  },
  render: () => (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
          In a talk card:
        </p>
        <div className="text-sm font-medium text-brand-cloud-blue">
          <ClickableSpeakerNames
            speakers={mockSpeakers.slice(0, 2)}
            linkClassName="hover:text-brand-cloud-blue/80 transition-colors"
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
          Compact mode (first names only):
        </p>
        <div className="text-xs text-gray-600 dark:text-gray-300">
          <ClickableSpeakerNames
            speakers={mockSpeakers.slice(0, 3)}
            showFirstNameOnly
            linkClassName="hover:underline"
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
          With maxVisible limit:
        </p>
        <div className="text-sm text-gray-600 dark:text-gray-300">
          <ClickableSpeakerNames
            speakers={mockSpeakers}
            maxVisible={2}
            linkClassName="text-brand-cloud-blue hover:underline"
          />
        </div>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Examples of how ClickableSpeakerNames looks in various contexts.',
      },
    },
  },
}
