import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ScheduleBuilderStatusWidget } from '../ScheduleBuilderStatusWidget'
import {
  setMockActionFor,
  mockPending,
  mockFailure,
  mockResolved,
} from './mock-admin-actions'
import {
  conferenceInPhase,
  scheduleStatusDense,
  scheduleStatusSparse,
} from './fixtures'
import {
  WidgetFrame,
  MatrixGrid,
  matrixSizesFor,
  defaultSizeFor,
} from './WidgetFrame'

const TYPE = 'schedule-builder'

const dense = conferenceInPhase('planning', 'schedule-builder/dense')
const sparse = conferenceInPhase('planning', 'schedule-builder/sparse')
const empty = conferenceInPhase('planning', 'schedule-builder/empty')
const loading = conferenceInPhase('planning', 'schedule-builder/loading')
const failing = conferenceInPhase('planning', 'schedule-builder/error')
const init = conferenceInPhase('initialization', 'schedule-builder/init')
const execution = conferenceInPhase('execution', 'schedule-builder/execution')
const post = conferenceInPhase('post-conference', 'schedule-builder/post')

setMockActionFor(
  dense._id,
  'fetchScheduleStatus',
  mockResolved(scheduleStatusDense),
)
setMockActionFor(
  sparse._id,
  'fetchScheduleStatus',
  mockResolved(scheduleStatusSparse),
)
setMockActionFor(empty._id, 'fetchScheduleStatus', mockResolved(null))
setMockActionFor(loading._id, 'fetchScheduleStatus', mockPending)
setMockActionFor(failing._id, 'fetchScheduleStatus', mockFailure)
setMockActionFor(init._id, 'fetchScheduleStatus', mockResolved(null))
setMockActionFor(
  execution._id,
  'fetchScheduleStatus',
  mockResolved(scheduleStatusDense),
)
setMockActionFor(
  post._id,
  'fetchScheduleStatus',
  mockResolved(scheduleStatusDense),
)

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/Matrix/ScheduleBuilder',
  tags: ['matrix'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'State x size matrix for ScheduleBuilderStatusWidget inside the real WidgetContainer geometry. Sizes come from the widget registry; per-cell data is forced through the mocked admin-actions module.',
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
          <ScheduleBuilderStatusWidget conference={dense} />
        </WidgetFrame>
      ))}
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Every registry size with 3 conference days, unassigned talks and placeholder slots all present.',
      },
    },
  },
}

export const AllStatesDefaultSize: Story = {
  render: () => {
    const size = defaultSizeFor(TYPE)
    return (
      <MatrixGrid>
        <WidgetFrame label="loading" {...size}>
          <ScheduleBuilderStatusWidget conference={loading} />
        </WidgetFrame>
        <WidgetFrame label="error" {...size}>
          <ScheduleBuilderStatusWidget conference={failing} />
        </WidgetFrame>
        <WidgetFrame label="empty (null data)" {...size}>
          <ScheduleBuilderStatusWidget conference={empty} />
        </WidgetFrame>
        <WidgetFrame label="sparse (1 day, 1 slot)" {...size}>
          <ScheduleBuilderStatusWidget conference={sparse} />
        </WidgetFrame>
        <WidgetFrame label="dense" {...size}>
          <ScheduleBuilderStatusWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="no conference" {...size}>
          <ScheduleBuilderStatusWidget />
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
        <WidgetFrame label="initialization (planning guide)" {...size}>
          <ScheduleBuilderStatusWidget conference={init} />
        </WidgetFrame>
        <WidgetFrame label="planning (operational)" {...size}>
          <ScheduleBuilderStatusWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="execution (operational)" {...size}>
          <ScheduleBuilderStatusWidget conference={execution} />
        </WidgetFrame>
        <WidgetFrame label="post-conference (archived)" {...size}>
          <ScheduleBuilderStatusWidget conference={post} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}

export const KnownRiskCells: Story = {
  render: () => (
    <MatrixGrid>
      <WidgetFrame label="min planning" colSpan={3} rowSpan={3}>
        <ScheduleBuilderStatusWidget conference={dense} />
      </WidgetFrame>
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The flagged 3x3 planning-phase cell: header, stat cards, overall bar, by-day list and the unassigned/placeholder footer competing for 3 rows.',
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
          <ScheduleBuilderStatusWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="mobile empty" mode="mobile">
          <ScheduleBuilderStatusWidget conference={empty} />
        </WidgetFrame>
        <WidgetFrame label="edit chrome" {...size} editMode>
          <ScheduleBuilderStatusWidget conference={dense} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}
