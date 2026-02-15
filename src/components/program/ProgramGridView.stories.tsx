import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProgramGridView } from './ProgramGridView'
import { BookmarksProvider } from '@/contexts/BookmarksContext'
import { Format, Language, Level, Audience, Status } from '@/lib/proposal/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'
import type { FilteredProgramData } from '@/hooks/useProgramFilter'
import type { Speaker } from '@/lib/speaker/types'
import { Flags } from '@/lib/speaker/types'

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

const createMockTalk = (
  id: string,
  title: string,
  startTime: string,
  endTime: string,
  trackTitle: string,
  trackIndex: number,
  scheduleDate: string,
) => ({
  startTime,
  endTime,
  scheduleDate,
  trackTitle,
  trackIndex,
  talk: {
    _id: id,
    _rev: '1',
    _type: 'talk',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    title,
    description: convertStringToPortableTextBlocks(
      `An insightful session about ${title.toLowerCase()}.`,
    ),
    language: Language.english,
    format: Format.presentation_45,
    level: Level.intermediate,
    audiences: [Audience.developer],
    status: Status.confirmed,
    outline: '',
    topics: mockTopics,
    tos: true,
    speakers: mockSpeakers,
    conference: { _id: 'conf-2025', _ref: 'conf-2025', _type: 'reference' },
  },
})

const createServiceSession = (
  placeholder: string,
  startTime: string,
  endTime: string,
  trackTitle: string,
  trackIndex: number,
  scheduleDate: string,
) => ({
  startTime,
  endTime,
  scheduleDate,
  trackTitle,
  trackIndex,
  placeholder,
})

const mockData: FilteredProgramData = {
  schedules: [
    {
      _id: 'schedule-day1',
      date: '2025-09-15',
      tracks: [
        {
          trackTitle: 'Main Stage',
          trackDescription: 'Keynotes and featured talks',
          talks: [
            {
              talk: createMockTalk(
                't1',
                'Building Scalable Cloud Native Apps',
                '09:00',
                '09:45',
                'Main Stage',
                0,
                '2025-09-15',
              ).talk!,
              startTime: '09:00',
              endTime: '09:45',
            },
            {
              placeholder: 'Coffee Break',
              startTime: '09:45',
              endTime: '10:00',
            },
            {
              talk: createMockTalk(
                't2',
                'GitOps Best Practices',
                '10:00',
                '10:45',
                'Main Stage',
                0,
                '2025-09-15',
              ).talk!,
              startTime: '10:00',
              endTime: '10:45',
            },
          ],
        },
        {
          trackTitle: 'Workshop Room',
          trackDescription: 'Hands-on workshops and tutorials',
          talks: [
            {
              talk: createMockTalk(
                't3',
                'Kubernetes Security Workshop',
                '09:00',
                '09:45',
                'Workshop Room',
                1,
                '2025-09-15',
              ).talk!,
              startTime: '09:00',
              endTime: '09:45',
            },
            {
              placeholder: 'Coffee Break',
              startTime: '09:45',
              endTime: '10:00',
            },
            {
              talk: createMockTalk(
                't4',
                'Observability Deep Dive',
                '10:00',
                '10:45',
                'Workshop Room',
                1,
                '2025-09-15',
              ).talk!,
              startTime: '10:00',
              endTime: '10:45',
            },
          ],
        },
      ],
    },
  ],
  allTalks: [
    createMockTalk(
      't1',
      'Building Scalable Cloud Native Apps',
      '09:00',
      '09:45',
      'Main Stage',
      0,
      '2025-09-15',
    ),
    createServiceSession(
      'Coffee Break',
      '09:45',
      '10:00',
      'Main Stage',
      0,
      '2025-09-15',
    ),
    createMockTalk(
      't2',
      'GitOps Best Practices',
      '10:00',
      '10:45',
      'Main Stage',
      0,
      '2025-09-15',
    ),
    createMockTalk(
      't3',
      'Kubernetes Security Workshop',
      '09:00',
      '09:45',
      'Workshop Room',
      1,
      '2025-09-15',
    ),
    createServiceSession(
      'Coffee Break',
      '09:45',
      '10:00',
      'Workshop Room',
      1,
      '2025-09-15',
    ),
    createMockTalk(
      't4',
      'Observability Deep Dive',
      '10:00',
      '10:45',
      'Workshop Room',
      1,
      '2025-09-15',
    ),
  ],
  availableFilters: {
    days: ['2025-09-15'],
    tracks: ['Main Stage', 'Workshop Room'],
    formats: [Format.presentation_45],
    levels: [Level.intermediate],
    audiences: [Audience.developer],
    topics: mockTopics,
  },
}

const multiDayData: FilteredProgramData = {
  schedules: [
    ...mockData.schedules,
    {
      _id: 'schedule-day2',
      date: '2025-09-16',
      tracks: [
        {
          trackTitle: 'Main Stage',
          trackDescription: 'Day 2 keynotes',
          talks: [
            {
              talk: createMockTalk(
                't5',
                'The Future of Platform Engineering',
                '09:00',
                '09:45',
                'Main Stage',
                0,
                '2025-09-16',
              ).talk!,
              startTime: '09:00',
              endTime: '09:45',
            },
            {
              talk: createMockTalk(
                't6',
                'Service Mesh Patterns',
                '10:00',
                '10:45',
                'Main Stage',
                0,
                '2025-09-16',
              ).talk!,
              startTime: '10:00',
              endTime: '10:45',
            },
          ],
        },
      ],
    },
  ],
  allTalks: [
    ...mockData.allTalks,
    createMockTalk(
      't5',
      'The Future of Platform Engineering',
      '09:00',
      '09:45',
      'Main Stage',
      0,
      '2025-09-16',
    ),
    createMockTalk(
      't6',
      'Service Mesh Patterns',
      '10:00',
      '10:45',
      'Main Stage',
      0,
      '2025-09-16',
    ),
  ],
  availableFilters: {
    ...mockData.availableFilters,
    days: ['2025-09-15', '2025-09-16'],
  },
}

const emptyData: FilteredProgramData = {
  schedules: [],
  allTalks: [],
  availableFilters: {
    days: [],
    tracks: [],
    formats: [],
    levels: [],
    audiences: [],
    topics: [],
  },
}

const meta = {
  title: 'Systems/Program/ProgramGridView',
  component: ProgramGridView,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Responsive card grid view for the program page. Displays talks as TalkCard components in a 1/2/3-column responsive grid. Shows an empty state when no talks match filters.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <BookmarksProvider>
        <Story />
      </BookmarksProvider>
    ),
  ],
} satisfies Meta<typeof ProgramGridView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    data: mockData,
  },
}

export const MultiDay: Story = {
  args: {
    data: multiDayData,
  },
  parameters: {
    docs: {
      description: {
        story: 'Grid view spanning multiple conference days.',
      },
    },
  },
}

export const WithLiveStatus: Story = {
  args: {
    data: mockData,
    talkStatusMap: new Map([
      ['2025-09-15|09:00|0|t1', 'happening-now'],
      ['2025-09-15|10:00|0|t2', 'upcoming'],
    ]),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Cards can show live status indicators for happening-now or upcoming talks.',
      },
    },
  },
}

export const Empty: Story = {
  args: {
    data: emptyData,
  },
  parameters: {
    docs: {
      description: {
        story: 'Empty state shown when no talks match the current filters.',
      },
    },
  },
}
