import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TalkCard } from './TalkCard'
import { BookmarksProvider } from '@/contexts/BookmarksContext'
import { Format, Language, Level, Audience, Status } from '@/lib/proposal/types'
import { Flags, Speaker } from '@/lib/speaker/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import type { TrackTalk } from '@/lib/conference/types'

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
]

const mockTopics = [
  {
    _id: 'topic-1',
    _type: 'topic' as const,
    title: 'Kubernetes',
    slug: { current: 'kubernetes' },
    color: '326CE5',
  },
  {
    _id: 'topic-2',
    _type: 'topic' as const,
    title: 'DevOps',
    slug: { current: 'devops' },
    color: 'FF6B35',
  },
]

type TalkCardTalk = TrackTalk & {
  scheduleDate: string
  trackTitle: string
  trackIndex: number
}

const createMockTalk = (
  overrides: Partial<TalkCardTalk> = {},
): TalkCardTalk => ({
  startTime: '10:00',
  endTime: '10:45',
  scheduleDate: '2025-09-15',
  trackTitle: 'Main Stage',
  trackIndex: 0,
  talk: {
    _id: 'talk-1',
    _rev: '1',
    _type: 'talk',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    title: 'Building Scalable Cloud Native Applications with Kubernetes',
    description: convertStringToPortableTextBlocks(
      'In this talk, we will explore best practices for building and deploying scalable applications on Kubernetes. We will cover topics like horizontal pod autoscaling, resource management, and observability patterns that help you build resilient systems.',
    ),
    language: Language.english,
    format: Format.presentation_45,
    level: Level.intermediate,
    audiences: [Audience.developer, Audience.architect],
    status: Status.confirmed,
    outline: '',
    topics: mockTopics,
    tos: true,
    speakers: mockSpeakers,
    conference: { _id: 'conf-2025', _ref: 'conf-2025', _type: 'reference' },
  },
  ...overrides,
})

const createServiceSession = (
  overrides: Partial<TalkCardTalk> = {},
): TalkCardTalk => ({
  startTime: '09:00',
  endTime: '09:30',
  scheduleDate: '2025-09-15',
  trackTitle: 'Main Stage',
  trackIndex: 0,
  placeholder: 'Registration & Welcome Coffee',
  ...overrides,
})

const meta = {
  title: 'Systems/Speakers/Program/TalkCard',
  component: TalkCard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Displays a talk in the program schedule with speaker information, time, track, format badges, and expandable description. Supports different states: confirmed, TBA, cancelled, happening now/soon, and past. Part of the program grid/list views.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <BookmarksProvider>
        <div className="max-w-2xl">
          <Story />
        </div>
      </BookmarksProvider>
    ),
  ],
  argTypes: {
    showDate: {
      control: 'boolean',
      description: 'Show the date in the card',
    },
    showTrack: {
      control: 'boolean',
      description: 'Show the track name in the card',
    },
    compact: {
      control: 'boolean',
      description: 'Use compact layout',
    },
    fixedHeight: {
      control: 'boolean',
      description: 'Use fixed height (clips content)',
    },
    status: {
      control: 'select',
      options: [undefined, 'past', 'happening-now', 'happening-soon'],
      description: 'Talk status indicator',
    },
  },
} satisfies Meta<typeof TalkCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    talk: createMockTalk(),
  },
}

export const WithDateAndTrack: Story = {
  args: {
    talk: createMockTalk(),
    showDate: true,
    showTrack: true,
  },
}

export const Compact: Story = {
  args: {
    talk: createMockTalk(),
    compact: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Compact mode hides description and uses smaller typography.',
      },
    },
  },
}

export const HappeningNow: Story = {
  args: {
    talk: createMockTalk(),
    status: 'happening-now',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows a pulsing green indicator when the talk is currently happening.',
      },
    },
  },
}

export const HappeningSoon: Story = {
  args: {
    talk: createMockTalk(),
    status: 'happening-soon',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows a pulsing yellow indicator when the talk is about to start.',
      },
    },
  },
}

export const Past: Story = {
  args: {
    talk: createMockTalk(),
    status: 'past',
  },
  parameters: {
    docs: {
      description: {
        story: 'Past talks are shown with reduced opacity.',
      },
    },
  },
}

export const ServiceSession: Story = {
  args: {
    talk: createServiceSession(),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Service sessions like breaks, registration, and lunch use a placeholder instead of talk data.',
      },
    },
  },
}

export const ServiceSessionLunch: Story = {
  args: {
    talk: createServiceSession({
      startTime: '12:00',
      endTime: '13:00',
      placeholder: 'Lunch Break',
    }),
  },
}

export const TBA: Story = {
  args: {
    talk: createMockTalk({
      talk: {
        _id: 'talk-tba',
        _rev: '1',
        _type: 'talk',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        title: 'TBA',
        description: [],
        language: Language.english,
        format: Format.presentation_45,
        level: Level.intermediate,
        audiences: [],
        status: Status.submitted,
        outline: '',
        tos: true,
        speakers: mockSpeakers,
        conference: { _id: 'conf-2025', _ref: 'conf-2025', _type: 'reference' },
      },
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Talks that are scheduled but not yet confirmed show a TBA indicator.',
      },
    },
  },
}

export const Cancelled: Story = {
  args: {
    talk: createMockTalk({
      talk: {
        _id: 'talk-cancelled',
        _rev: '1',
        _type: 'talk',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        title: 'Cancelled Talk',
        description: [],
        language: Language.english,
        format: Format.presentation_45,
        level: Level.intermediate,
        audiences: [],
        status: Status.withdrawn,
        outline: '',
        tos: true,
        speakers: mockSpeakers,
        conference: { _id: 'conf-2025', _ref: 'conf-2025', _type: 'reference' },
      },
    }),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Withdrawn or rejected talks display a cancelled state with distinctive styling.',
      },
    },
  },
}

export const SingleSpeaker: Story = {
  args: {
    talk: createMockTalk({
      talk: {
        _id: 'talk-single',
        _rev: '1',
        _type: 'talk',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        title: 'Solo Presentation on Cloud Native Patterns',
        description: convertStringToPortableTextBlocks(
          'A deep dive into cloud native architectural patterns.',
        ),
        language: Language.english,
        format: Format.presentation_45,
        level: Level.intermediate,
        audiences: [Audience.developer],
        status: Status.confirmed,
        outline: '',
        topics: [mockTopics[0]],
        tos: true,
        speakers: [mockSpeakers[0]],
        conference: { _id: 'conf-2025', _ref: 'conf-2025', _type: 'reference' },
      },
    }),
  },
}

export const LightningTalk: Story = {
  args: {
    talk: createMockTalk({
      startTime: '14:00',
      endTime: '14:10',
      talk: {
        _id: 'talk-lightning',
        _rev: '1',
        _type: 'talk',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        title: '5 Tips for Better Kubernetes Debugging',
        description: convertStringToPortableTextBlocks(
          'Quick tips for debugging Kubernetes applications effectively.',
        ),
        language: Language.english,
        format: Format.lightning_10,
        level: Level.beginner,
        audiences: [Audience.developer],
        status: Status.confirmed,
        outline: '',
        topics: [mockTopics[0]],
        tos: true,
        speakers: [mockSpeakers[0]],
        conference: { _id: 'conf-2025', _ref: 'conf-2025', _type: 'reference' },
      },
    }),
  },
}

export const Workshop: Story = {
  args: {
    talk: createMockTalk({
      startTime: '09:00',
      endTime: '12:00',
      talk: {
        _id: 'talk-workshop',
        _rev: '1',
        _type: 'talk',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        title: 'Hands-on Kubernetes Workshop',
        description: convertStringToPortableTextBlocks(
          'Learn Kubernetes from scratch in this hands-on workshop. Bring your laptop!',
        ),
        language: Language.english,
        format: Format.workshop_120,
        level: Level.beginner,
        audiences: [Audience.developer, Audience.operator],
        status: Status.confirmed,
        outline: '',
        topics: mockTopics,
        tos: true,
        speakers: mockSpeakers,
        conference: { _id: 'conf-2025', _ref: 'conf-2025', _type: 'reference' },
      },
    }),
    showDate: true,
    showTrack: true,
  },
}

export const ProgramGrid: Story = {
  args: {
    talk: createMockTalk(),
  },
  render: () => (
    <div className="space-y-4">
      <h3 className="font-space-grotesk text-lg font-semibold text-gray-900 dark:text-white">
        Program Schedule
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        <BookmarksProvider>
          <TalkCard talk={createMockTalk()} />
          <TalkCard
            talk={createMockTalk({
              startTime: '11:00',
              endTime: '11:45',
              trackTitle: 'Workshop Room',
              talk: {
                _id: 'talk-2',
                _rev: '1',
                _type: 'talk',
                _createdAt: '2024-01-01T00:00:00Z',
                _updatedAt: '2024-01-01T00:00:00Z',
                title: 'GitOps Best Practices',
                description: convertStringToPortableTextBlocks(
                  'Learn how to implement GitOps in your organization.',
                ),
                language: Language.english,
                format: Format.presentation_45,
                level: Level.intermediate,
                audiences: [Audience.devopsEngineer],
                status: Status.confirmed,
                outline: '',
                topics: [mockTopics[1]],
                tos: true,
                speakers: [mockSpeakers[1]],
                conference: {
                  _id: 'conf-2025',
                  _ref: 'conf-2025',
                  _type: 'reference',
                },
              },
            })}
          />
          <TalkCard
            talk={createServiceSession({
              startTime: '11:45',
              endTime: '12:00',
              placeholder: 'Coffee Break',
            })}
          />
          <TalkCard
            talk={createMockTalk({
              startTime: '12:00',
              endTime: '12:45',
            })}
            status="happening-now"
          />
        </BookmarksProvider>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Example of multiple TalkCards in a grid layout, showing various states.',
      },
    },
  },
}
