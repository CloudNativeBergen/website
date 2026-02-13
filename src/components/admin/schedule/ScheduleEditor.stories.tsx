import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ScheduleEditor } from './ScheduleEditor'
import {
  ConferenceSchedule,
  ScheduleTrack,
  TrackTalk,
  Conference,
} from '@/lib/conference/types'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'

const createMockProposal = (
  overrides: Partial<ProposalExisting> & { _id: string; title: string },
): ProposalExisting =>
  ({
    _rev: '1',
    _type: 'talk',
    _createdAt: '2024-11-15T10:30:00Z',
    _updatedAt: '2024-11-20T14:45:00Z',
    description: convertStringToPortableTextBlocks('A talk description.'),
    language: Language.english,
    format: Format.presentation_45,
    level: Level.intermediate,
    audiences: [Audience.developer],
    status: Status.confirmed,
    outline: '',
    topics: [
      {
        _id: 'topic-1',
        _type: 'topic',
        title: 'Kubernetes',
        color: '#326CE5',
        slug: { current: 'kubernetes' },
      },
    ],
    tos: true,
    speakers: [
      {
        _id: 'speaker-1',
        _rev: '1',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        name: 'Jane Doe',
        email: 'jane@example.com',
        slug: 'jane-doe',
      },
    ],
    conference: { _type: 'reference', _ref: 'conf-1' },
    attachments: [],
    ...overrides,
  }) as unknown as ProposalExisting

const mockConference: Conference = {
  _id: 'conf-2025',
  title: 'Cloud Native Days Norway 2025',
  organizer: 'Cloud Native Days Norway',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2025-09-18',
  endDate: '2025-09-19',
  cfpStartDate: '2025-03-01',
  cfpEndDate: '2025-06-01',
  cfpNotifyDate: '2025-07-01',
  cfpEmail: 'cfp@cloudnativebergen.no',
  sponsorEmail: 'sponsors@cloudnativebergen.no',
  programDate: '2025-08-01',
  contactEmail: 'info@cloudnativebergen.no',
  registrationEnabled: true,
  organizers: [],
  domains: ['cloudnativebergen.no'],
  formats: [
    Format.lightning_10,
    Format.presentation_25,
    Format.presentation_45,
    Format.workshop_120,
  ],
  topics: [
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
      title: 'Observability',
      color: '#8B5CF6',
      slug: { current: 'observability' },
    },
    {
      _id: 'topic-3',
      _type: 'topic',
      title: 'Security',
      color: '#EF4444',
      slug: { current: 'security' },
    },
  ],
}

const scheduledProposals = [
  createMockProposal({
    _id: 'scheduled-1',
    title: 'Keynote: Cloud Native in 2025',
    format: Format.presentation_45,
    level: Level.beginner,
  }),
  createMockProposal({
    _id: 'scheduled-2',
    title: 'GitOps Best Practices',
    format: Format.presentation_25,
    level: Level.intermediate,
    topics: [
      {
        _id: 'topic-1',
        _type: 'topic',
        title: 'Kubernetes',
        color: '#326CE5',
        slug: { current: 'kubernetes' },
      },
    ],
  }),
  createMockProposal({
    _id: 'scheduled-3',
    title: 'eBPF for Network Security',
    format: Format.presentation_45,
    level: Level.advanced,
    topics: [
      {
        _id: 'topic-3',
        _type: 'topic',
        title: 'Security',
        color: '#EF4444',
        slug: { current: 'security' },
      },
    ],
  }),
]

const unscheduledProposals = [
  createMockProposal({
    _id: 'unscheduled-1',
    title: 'Platform Engineering 101',
    format: Format.presentation_25,
    level: Level.beginner,
  }),
  createMockProposal({
    _id: 'unscheduled-2',
    title: 'OpenTelemetry Deep Dive',
    format: Format.presentation_45,
    level: Level.intermediate,
    topics: [
      {
        _id: 'topic-2',
        _type: 'topic',
        title: 'Observability',
        color: '#8B5CF6',
        slug: { current: 'observability' },
      },
    ],
  }),
  createMockProposal({
    _id: 'unscheduled-3',
    title: 'Lightning: Wasm in 10 Minutes',
    format: Format.lightning_10,
    level: Level.beginner,
  }),
  createMockProposal({
    _id: 'unscheduled-4',
    title: 'Service Mesh with Istio',
    format: Format.presentation_45,
    level: Level.advanced,
    topics: [
      {
        _id: 'topic-1',
        _type: 'topic',
        title: 'Kubernetes',
        color: '#326CE5',
        slug: { current: 'kubernetes' },
      },
    ],
  }),
]

const mainTrack: ScheduleTrack = {
  trackTitle: 'Main Stage',
  trackDescription: 'The primary conference track',
  talks: [
    {
      placeholder: 'Registration & Coffee',
      startTime: '08:00',
      endTime: '09:00',
    },
    {
      talk: scheduledProposals[0],
      startTime: '09:00',
      endTime: '09:45',
    } as TrackTalk,
    {
      placeholder: 'Break',
      startTime: '09:45',
      endTime: '10:00',
    },
    {
      talk: scheduledProposals[1],
      startTime: '10:00',
      endTime: '10:25',
    } as TrackTalk,
  ],
}

const secondTrack: ScheduleTrack = {
  trackTitle: 'Room 2',
  trackDescription: 'Secondary track for deep-dive sessions',
  talks: [
    {
      talk: scheduledProposals[2],
      startTime: '09:00',
      endTime: '09:45',
    } as TrackTalk,
  ],
}

const emptySchedule: ConferenceSchedule = {
  _id: 'schedule-empty',
  date: '2025-09-18',
  tracks: [],
}

const singleDaySchedule: ConferenceSchedule = {
  _id: 'schedule-day1',
  date: '2025-09-18',
  tracks: [mainTrack, secondTrack],
}

const multiDaySchedules: ConferenceSchedule[] = [
  singleDaySchedule,
  {
    _id: 'schedule-day2',
    date: '2025-09-19',
    tracks: [
      {
        trackTitle: 'Workshop Room A',
        trackDescription: 'Full-day workshops',
        talks: [],
      },
      {
        trackTitle: 'Workshop Room B',
        trackDescription: 'Half-day workshops',
        talks: [],
      },
    ],
  },
]

const allProposals = [...scheduledProposals, ...unscheduledProposals]

const meta: Meta<typeof ScheduleEditor> = {
  title: 'Systems/Program/Admin/ScheduleEditor',
  component: ScheduleEditor,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The main schedule editor component. Features a sidebar with unassigned proposals (search, filter, virtual scroll), day navigation for multi-day conferences, drag-and-drop scheduling with swap detection, track management (add/remove/edit), and save functionality. This is a complex stateful component that manages the full scheduling workflow.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof ScheduleEditor>

export const EmptySchedule: Story = {
  args: {
    initialSchedules: [emptySchedule],
    conference: mockConference,
    initialProposals: allProposals,
  },
  parameters: {
    docs: {
      description: {
        story:
          'An empty schedule with no tracks. Shows the empty state with a prompt to create the first track. All proposals appear in the unassigned sidebar.',
      },
    },
  },
}

export const SingleDayWithTracks: Story = {
  args: {
    initialSchedules: [singleDaySchedule],
    conference: mockConference,
    initialProposals: allProposals,
  },
  parameters: {
    docs: {
      description: {
        story:
          'A single-day schedule with two tracks containing scheduled talks and service sessions. Unassigned proposals appear in the sidebar ready for drag-and-drop.',
      },
    },
  },
}

export const MultiDay: Story = {
  args: {
    initialSchedules: multiDaySchedules,
    conference: mockConference,
    initialProposals: allProposals,
  },
  parameters: {
    docs: {
      description: {
        story:
          'A multi-day conference schedule with day navigation tabs. Day 1 has populated tracks; Day 2 has empty workshop rooms. Click the day tabs to switch between days.',
      },
    },
  },
}
