import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SpeakerEngagementWidget } from '../SpeakerEngagementWidget'
import {
  setMockActionFor,
  mockPending,
  mockFailure,
  mockResolved,
} from './mock-admin-actions'
import {
  conferenceInPhase,
  speakerEngagementDense,
  speakerEngagementSparse,
} from './fixtures'
import {
  WidgetFrame,
  MatrixGrid,
  matrixSizesFor,
  defaultSizeFor,
} from './WidgetFrame'

const TYPE = 'speaker-engagement'

const dense = conferenceInPhase('planning', 'speaker-engagement/dense')
const sparse = conferenceInPhase('planning', 'speaker-engagement/sparse')
const empty = conferenceInPhase('planning', 'speaker-engagement/empty')
const loading = conferenceInPhase('planning', 'speaker-engagement/loading')
const failing = conferenceInPhase('planning', 'speaker-engagement/error')
const init = conferenceInPhase('initialization', 'speaker-engagement/init')
const initZero = conferenceInPhase(
  'initialization',
  'speaker-engagement/init-zero',
)
const execution = conferenceInPhase('execution', 'speaker-engagement/execution')
const post = conferenceInPhase('post-conference', 'speaker-engagement/post')

setMockActionFor(
  dense._id,
  'fetchSpeakerEngagement',
  mockResolved(speakerEngagementDense),
)
setMockActionFor(
  sparse._id,
  'fetchSpeakerEngagement',
  mockResolved(speakerEngagementSparse),
)
setMockActionFor(empty._id, 'fetchSpeakerEngagement', mockResolved(null))
setMockActionFor(loading._id, 'fetchSpeakerEngagement', mockPending)
setMockActionFor(failing._id, 'fetchSpeakerEngagement', mockFailure)
setMockActionFor(
  init._id,
  'fetchSpeakerEngagement',
  mockResolved(speakerEngagementDense),
)
setMockActionFor(initZero._id, 'fetchSpeakerEngagement', mockResolved(null))
setMockActionFor(
  execution._id,
  'fetchSpeakerEngagement',
  mockResolved(speakerEngagementDense),
)
setMockActionFor(
  post._id,
  'fetchSpeakerEngagement',
  mockResolved(speakerEngagementDense),
)

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/Matrix/SpeakerEngagement',
  tags: ['matrix'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'State x size matrix for SpeakerEngagementWidget inside the real WidgetContainer geometry. Sizes come from the widget registry; per-cell data is forced through the mocked admin-actions module.',
      },
    },
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const AllSizesDense: Story = {
  render: () => (
    <MatrixGrid>
      {matrixSizesFor(TYPE).map((s) => (
        <WidgetFrame
          key={s.name}
          label={s.name}
          colSpan={s.colSpan}
          rowSpan={s.rowSpan}
        >
          <SpeakerEngagementWidget conference={dense} />
        </WidgetFrame>
      ))}
    </MatrixGrid>
  ),
}

export const AllStatesDefaultSize: Story = {
  render: () => {
    const size = defaultSizeFor(TYPE)
    return (
      <MatrixGrid>
        <WidgetFrame label="loading" {...size}>
          <SpeakerEngagementWidget conference={loading} />
        </WidgetFrame>
        <WidgetFrame label="error" {...size}>
          <SpeakerEngagementWidget conference={failing} />
        </WidgetFrame>
        <WidgetFrame label="empty (null data)" {...size}>
          <SpeakerEngagementWidget conference={empty} />
        </WidgetFrame>
        <WidgetFrame label="sparse (2 speakers)" {...size}>
          <SpeakerEngagementWidget conference={sparse} />
        </WidgetFrame>
        <WidgetFrame label="dense" {...size}>
          <SpeakerEngagementWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="no conference" {...size}>
          <SpeakerEngagementWidget />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}

export const Phases: Story = {
  render: () => {
    const size = defaultSizeFor(TYPE)
    return (
      <MatrixGrid>
        <WidgetFrame label="initialization + data (outreach)" {...size}>
          <SpeakerEngagementWidget conference={init} />
        </WidgetFrame>
        <WidgetFrame label="initialization, no data" {...size}>
          <SpeakerEngagementWidget conference={initZero} />
        </WidgetFrame>
        <WidgetFrame label="planning (engagement)" {...size}>
          <SpeakerEngagementWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="execution (status)" {...size}>
          <SpeakerEngagementWidget conference={execution} />
        </WidgetFrame>
        <WidgetFrame label="post-conference (summary)" {...size}>
          <SpeakerEngagementWidget conference={post} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}

export const KnownRiskCells: Story = {
  render: () => (
    <MatrixGrid>
      <WidgetFrame label="min, initialization" colSpan={3} rowSpan={2}>
        <SpeakerEngagementWidget conference={init} />
      </WidgetFrame>
      <WidgetFrame label="min, operational" colSpan={3} rowSpan={2}>
        <SpeakerEngagementWidget conference={dense} />
      </WidgetFrame>
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The flagged 3x2 initialization cell: the tall outreach card content inside the 2-row minimum, plus the operational view at the same minimum.',
      },
    },
  },
}

export const MobileAndEditChrome: Story = {
  render: () => {
    const size = defaultSizeFor(TYPE)
    return (
      <MatrixGrid>
        <WidgetFrame label="mobile dense" mode="mobile">
          <SpeakerEngagementWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="mobile init" mode="mobile">
          <SpeakerEngagementWidget conference={init} />
        </WidgetFrame>
        <WidgetFrame label="edit chrome" {...size} editMode showConfigDot>
          <SpeakerEngagementWidget conference={dense} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}
