import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProgramAgendaView } from './ProgramAgendaView'
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
    description: convertStringToPortableTextBlocks(`${title} session.`),
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

const mockData: FilteredProgramData = {
  schedules: [
    {
      _id: 'schedule-day1',
      date: '2025-09-15',
      tracks: [{ trackTitle: 'Main Stage', trackDescription: '', talks: [] }],
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
      '13:00',
      '13:45',
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

const meta = {
  title: 'Systems/Program/ProgramAgendaView',
  component: ProgramAgendaView,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Personal agenda view that shows only bookmarked talks. Uses the BookmarksContext to filter talks the user has saved. Shows empty states for both no bookmarks and no matching talks after filtering. Bookmark talks from other views to see them here.',
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
} satisfies Meta<typeof ProgramAgendaView>

export default meta
type Story = StoryObj<typeof meta>

export const Empty: Story = {
  args: {
    data: mockData,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Default state when no talks have been bookmarked. Shows a prompt to start building your agenda.',
      },
    },
  },
}
