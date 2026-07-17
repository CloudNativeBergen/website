import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useReducer } from 'react'
import { MobileScheduleView } from './MobileScheduleView'
import {
  scheduleReducer,
  initScheduleEditorState,
} from '@/lib/schedule/reducer'
import { computeUnassigned } from '@/lib/schedule/operations'
import { ConferenceSchedule } from '@/lib/conference/types'
import {
  ProposalExisting,
  Format,
  Language,
  Level,
  Audience,
  Status,
} from '@/lib/proposal/types'
import { convertStringToPortableTextBlocks } from '@/lib/proposal'

const makeProposal = (
  overrides: Partial<ProposalExisting> & { _id: string; title: string },
): ProposalExisting => ({
  _rev: '1',
  _type: 'talk',
  _createdAt: '2024-01-01T00:00:00Z',
  _updatedAt: '2024-01-01T00:00:00Z',
  description: convertStringToPortableTextBlocks('A talk.'),
  language: Language.english,
  format: Format.presentation_45,
  level: Level.intermediate,
  audiences: [Audience.developer],
  status: Status.confirmed,
  outline: '',
  topics: [],
  tos: true,
  speakers: [
    {
      _id: `sp-${overrides._id}`,
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
})

const scheduledA = makeProposal({
  _id: 'sched-a',
  title: 'Building Scalable Kubernetes Applications',
})
const scheduledB = makeProposal({
  _id: 'sched-b',
  title: 'Service Mesh Deep Dive',
  format: Format.presentation_25,
  level: Level.advanced,
})

const unassigned: ProposalExisting[] = [
  makeProposal({
    _id: 'un-1',
    title: 'Cloud Native CI/CD Pipelines',
    format: Format.lightning_10,
    level: Level.beginner,
  }),
  makeProposal({
    _id: 'un-2',
    title: 'Observability with OpenTelemetry',
    format: Format.presentation_45,
    status: Status.accepted,
  }),
  makeProposal({
    _id: 'un-3',
    title: 'Platform Engineering 101',
    format: Format.presentation_25,
    level: Level.beginner,
    audiences: [Audience.manager],
  }),
]

const schedules: ConferenceSchedule[] = [
  {
    _id: 'day-1',
    date: '2026-09-01',
    tracks: [
      {
        trackTitle: 'Main Stage',
        trackDescription: '',
        talks: [
          { talk: scheduledA, startTime: '09:00', endTime: '09:45' },
          { placeholder: 'Coffee Break', startTime: '09:45', endTime: '10:00' },
          { talk: scheduledB, startTime: '10:00', endTime: '10:25' },
        ],
      },
      { trackTitle: 'Workshop Room', trackDescription: '', talks: [] },
    ],
  },
  {
    _id: 'day-2',
    date: '2026-09-02',
    tracks: [{ trackTitle: 'Main Stage', trackDescription: '', talks: [] }],
  },
]

function MobileScheduleHarness({
  initialSchedules,
  proposals,
}: {
  initialSchedules: ConferenceSchedule[]
  proposals: ProposalExisting[]
}) {
  const [state, dispatch] = useReducer(
    scheduleReducer,
    { schedules: initialSchedules, proposals },
    initScheduleEditorState,
  )
  const unassignedProposals = computeUnassigned(
    state.proposals,
    state.schedules,
  )

  return (
    <MobileScheduleView
      schedules={state.schedules}
      currentDayIndex={state.currentDayIndex}
      unassignedProposals={unassignedProposals}
      dispatch={dispatch}
      onDayChange={(dayIndex) => dispatch({ type: 'changeDay', dayIndex })}
      onSave={() => {}}
      onAddTrack={() => {}}
      isSaving={state.ui.isSaving}
      saveSuccess={false}
      error={state.ui.error}
    />
  )
}

const meta: Meta<typeof MobileScheduleHarness> = {
  title: 'Systems/Program/Admin/MobileScheduleView',
  component: MobileScheduleHarness,
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    docs: {
      description: {
        component:
          'Tap-to-assign mobile schedule editor rendered below the `md` breakpoint. A light top nav (Schedule title, unassigned/legend/save cluster, scrollable day chips) sits above a swipeable track tab strip — swipe or tap between tracks, with a trailing “＋” chip to add one. Agenda cards and bottom sheets handle assigning talks, moving them, and managing service sessions. Wired to the real schedule reducer so interactions mutate state.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof MobileScheduleHarness>

export const Default: Story = {
  args: { initialSchedules: schedules, proposals: unassigned },
}

export const EmptyTrack: Story = {
  args: {
    initialSchedules: [
      {
        _id: 'day-1',
        date: '2026-09-01',
        tracks: [{ trackTitle: 'Main Stage', trackDescription: '', talks: [] }],
      },
    ],
    proposals: unassigned,
  },
}

export const NoTracks: Story = {
  args: {
    initialSchedules: [{ _id: 'day-1', date: '2026-09-01', tracks: [] }],
    proposals: unassigned,
  },
}
