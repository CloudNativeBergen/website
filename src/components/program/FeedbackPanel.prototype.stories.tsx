// PROTOTYPE — throwaway. Mock data copied from ProgramListView.stories.tsx.
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProgramListView } from './ProgramListView'
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
    // Every talk holds a Feedback Code, as on the day (#1472).
    hasFeedbackCode: true,
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

const singleDayData: FilteredProgramData = {
  schedules: [
    {
      _id: 'schedule-day1',
      date: '2025-09-15',
      tracks: [
        {
          trackTitle: 'Main Stage',
          trackDescription: 'Keynotes and featured talks',
          talks: [],
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
      '10:00',
      '10:45',
      'Workshop Room',
      1,
      '2025-09-15',
    ),
    createServiceSession(
      'Lunch Break',
      '12:00',
      '13:00',
      'Main Stage',
      0,
      '2025-09-15',
    ),
    createMockTalk(
      't4',
      'Observability Deep Dive',
      '13:00',
      '13:45',
      'Main Stage',
      0,
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

import {
  ProgrammeWithFeedbackPanel,
  type Variant,
} from './FeedbackPanel.prototype'
import type { AttendeeFeedbackState } from '@/lib/feedback/server'

const speakers = ['Alice Johnson', 'Bob Smith']
const talk = (title: string) => ({ title, speakers })

/** What `/f/<code>` would resolve to for each talk, on the day. */
const pages: Record<string, AttendeeFeedbackState> = {
  t1: {
    state: 'closed',
    talk: talk('Building Scalable Cloud Native Apps'),
    canDelete: false,
  },
  t2: {
    state: 'open',
    talk: talk('GitOps Best Practices'),
    closesAt: '2025-09-16T10:45:00.000Z',
  },
  t3: {
    state: 'answered',
    talk: talk('Kubernetes Security Workshop'),
    colour: 'green',
    comment: 'Great hands-on labs.',
  },
  t4: {
    state: 'not-yet-open',
    talk: talk('Observability Deep Dive'),
    opensAt: '2025-09-15T13:00:00.000Z',
    canDelete: false,
  },
}

function Prototype({ variant }: { variant: Variant }) {
  return (
    <BookmarksProvider>
      <ProgrammeWithFeedbackPanel initialVariant={variant} pages={pages}>
        <div className="mx-auto max-w-5xl p-4">
          <ProgramListView
            data={singleDayData}
            talkStatusMap={
              new Map([
                ['2025-09-15|09:00|0|t1', 'past'],
                ['2025-09-15|10:00|0|t2', 'happening-now'],
                ['2025-09-15|10:00|1|t3', 'happening-now'],
                ['2025-09-15|13:00|0|t4', 'upcoming'],
              ])
            }
          />
        </div>
      </ProgrammeWithFeedbackPanel>
    </BookmarksProvider>
  )
}

const meta = {
  title: 'Prototypes/Programme feedback panel',
  component: Prototype,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'PROTOTYPE (#1472 follow-up): "Give feedback" opens the feedback UI in place instead of navigating. Flip variants with the floating bar or ← / →. Talk states: 1 Closed, 2 Open, 3 Answered, 4 Not yet open. Actions are stubs.',
      },
    },
  },
} satisfies Meta<typeof Prototype>

export default meta
type Story = StoryObj<typeof meta>

/** Opens the panel for the live talk, so a capture shows it. */
const play: Story['play'] = async ({ canvas, userEvent }) => {
  await userEvent.click(
    canvas.getByRole('link', {
      name: 'Give feedback on GitOps Best Practices',
    }),
  )
}

export const BottomSheet: Story = { args: { variant: 'A' }, play }
export const SideDrawer: Story = { args: { variant: 'B' }, play }
export const CentredModal: Story = { args: { variant: 'C' }, play }
/** Closed panel, to see the programme and the switcher. */
export const Programme: Story = { args: { variant: 'A' } }
