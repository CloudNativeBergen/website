import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProgramScheduleView } from './ProgramScheduleView'
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
]

const createTalk = (
  id: string,
  title: string,
  format = Format.presentation_45,
) => ({
  _id: id,
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  title,
  description: convertStringToPortableTextBlocks(`${title} - a great session.`),
  language: Language.english,
  format,
  level: Level.intermediate,
  audiences: [Audience.developer] as Audience[],
  status: Status.confirmed,
  outline: '',
  topics: mockTopics,
  tos: true,
  speakers: mockSpeakers,
  conference: { _id: 'conf-2025', _ref: 'conf-2025', _type: 'reference' },
})

const twoTrackData: FilteredProgramData = {
  schedules: [
    {
      _id: 'schedule-day1',
      date: '2025-09-15',
      tracks: [
        {
          trackTitle: 'Main Stage',
          trackDescription: 'Keynotes and featured presentations',
          talks: [
            {
              talk: createTalk('t1', 'Opening Keynote'),
              startTime: '09:00',
              endTime: '09:45',
            },
            {
              placeholder: 'Coffee Break',
              startTime: '09:45',
              endTime: '10:00',
            },
            {
              talk: createTalk('t2', 'GitOps Best Practices'),
              startTime: '10:00',
              endTime: '10:45',
            },
            { placeholder: 'Lunch', startTime: '12:00', endTime: '13:00' },
            {
              talk: createTalk('t5', 'Closing Keynote'),
              startTime: '13:00',
              endTime: '13:45',
            },
          ],
        },
        {
          trackTitle: 'Workshop Room',
          trackDescription: 'Hands-on workshops and tutorials',
          talks: [
            {
              talk: createTalk(
                't3',
                'Kubernetes Security Workshop',
                Format.workshop_120,
              ),
              startTime: '09:00',
              endTime: '09:45',
            },
            {
              placeholder: 'Coffee Break',
              startTime: '09:45',
              endTime: '10:00',
            },
            {
              talk: createTalk('t4', 'Observability Deep Dive'),
              startTime: '10:00',
              endTime: '10:45',
            },
            { placeholder: 'Lunch', startTime: '12:00', endTime: '13:00' },
            {
              talk: createTalk('t6', 'Service Mesh Patterns'),
              startTime: '13:00',
              endTime: '13:45',
            },
          ],
        },
      ],
    },
  ],
  allTalks: [],
  availableFilters: {
    days: ['2025-09-15'],
    tracks: ['Main Stage', 'Workshop Room'],
    formats: [Format.presentation_45, Format.workshop_120],
    levels: [Level.intermediate],
    audiences: [Audience.developer],
    topics: mockTopics,
  },
}

const multiDayData: FilteredProgramData = {
  schedules: [
    ...twoTrackData.schedules,
    {
      _id: 'schedule-day2',
      date: '2025-09-16',
      tracks: [
        {
          trackTitle: 'Main Stage',
          trackDescription: 'Day 2 keynotes',
          talks: [
            {
              talk: createTalk('t7', 'Platform Engineering in 2025'),
              startTime: '09:00',
              endTime: '09:45',
            },
            {
              talk: createTalk('t8', 'eBPF for Beginners'),
              startTime: '10:00',
              endTime: '10:45',
            },
          ],
        },
        {
          trackTitle: 'Community Track',
          trackDescription: 'Community-driven sessions',
          talks: [
            {
              talk: createTalk('t9', 'Open Source Sustainability'),
              startTime: '09:00',
              endTime: '09:45',
            },
            {
              talk: createTalk('t10', 'Contributing to CNCF Projects'),
              startTime: '10:00',
              endTime: '10:45',
            },
          ],
        },
      ],
    },
  ],
  allTalks: [],
  availableFilters: {
    days: ['2025-09-15', '2025-09-16'],
    tracks: ['Main Stage', 'Workshop Room', 'Community Track'],
    formats: [Format.presentation_45, Format.workshop_120],
    levels: [Level.intermediate],
    audiences: [Audience.developer],
    topics: mockTopics,
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
  title: 'Systems/Program/ProgramScheduleView',
  component: ProgramScheduleView,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full schedule view with a tabbed mobile layout and a time-based grid on desktop. Shows tracks as columns with time slots as rows. Supports live scroll-to-current and status indicators. Resize the browser to see the mobile tabbed interface.',
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <BookmarksProvider>
        <div className="p-4">
          <Story />
        </div>
      </BookmarksProvider>
    ),
  ],
} satisfies Meta<typeof ProgramScheduleView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    data: twoTrackData,
  },
}

export const MultiDay: Story = {
  args: {
    data: multiDayData,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Multi-day schedule with day headings and different track configurations per day.',
      },
    },
  },
}

export const WithLiveStatus: Story = {
  args: {
    data: twoTrackData,
    talkStatusMap: new Map([
      ['2025-09-15|09:00|0|t1', 'past'],
      ['2025-09-15|10:00|0|t2', 'happening-now'],
      ['2025-09-15|10:00|1|t4', 'happening-now'],
      ['2025-09-15|13:00|0|t5', 'upcoming'],
    ]),
    isLive: true,
    currentPosition: {
      scheduleIndex: 0,
      trackIndex: 0,
      talkIndex: 2,
      talk: {
        talk: createTalk('t2', 'GitOps Best Practices'),
        startTime: '10:00',
        endTime: '10:45',
      },
      scheduleDate: '2025-09-15',
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Live mode with status indicators and auto-scroll to the current talk.',
      },
    },
  },
}

export const Empty: Story = {
  args: {
    data: emptyData,
  },
}
