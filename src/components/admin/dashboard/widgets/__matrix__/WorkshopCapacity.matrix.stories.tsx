import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { WorkshopCapacityWidget } from '../WorkshopCapacityWidget'
import {
  setMockActionFor,
  mockPending,
  mockFailure,
  mockResolved,
} from './mock-admin-actions'
import { conferenceInPhase, workshopCapacityDense } from './fixtures'
import {
  WidgetFrame,
  MatrixGrid,
  matrixSizesFor,
  defaultSizeFor,
} from './WidgetFrame'

const TYPE = 'workshop-capacity'

// Operational view renders in execution (init/planning show the planning card
// when the workshop list is empty).
const dense = conferenceInPhase('execution', 'workshop-capacity/dense')
const empty = conferenceInPhase('execution', 'workshop-capacity/empty')
const loading = conferenceInPhase('execution', 'workshop-capacity/loading')
const failing = conferenceInPhase('execution', 'workshop-capacity/error')
const init = conferenceInPhase('initialization', 'workshop-capacity/init')
const planningCard = conferenceInPhase('planning', 'workshop-capacity/planning')
const post = conferenceInPhase('post-conference', 'workshop-capacity/post')

setMockActionFor(
  dense._id,
  'fetchWorkshopCapacity',
  mockResolved(workshopCapacityDense),
)
setMockActionFor(empty._id, 'fetchWorkshopCapacity', mockResolved(null))
setMockActionFor(loading._id, 'fetchWorkshopCapacity', mockPending)
setMockActionFor(failing._id, 'fetchWorkshopCapacity', mockFailure)
setMockActionFor(init._id, 'fetchWorkshopCapacity', mockResolved(null))
setMockActionFor(planningCard._id, 'fetchWorkshopCapacity', mockResolved(null))
setMockActionFor(
  post._id,
  'fetchWorkshopCapacity',
  mockResolved(workshopCapacityDense),
)

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/Matrix/WorkshopCapacity',
  tags: ['matrix'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'State x size matrix for WorkshopCapacityWidget inside the real WidgetContainer geometry. Sizes come from the widget registry; per-cell data is forced through the mocked admin-actions module.',
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
          <WorkshopCapacityWidget conference={dense} />
        </WidgetFrame>
      ))}
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Every registry size with 6 workshops (long titles, two full with waitlists) — the list plus 3 stat cards is the layout-stress axis in 2-row cells.',
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
          <WorkshopCapacityWidget conference={loading} />
        </WidgetFrame>
        <WidgetFrame label="error" {...size}>
          <WorkshopCapacityWidget conference={failing} />
        </WidgetFrame>
        <WidgetFrame label="empty (null data)" {...size}>
          <WorkshopCapacityWidget conference={empty} />
        </WidgetFrame>
        <WidgetFrame label="dense" {...size}>
          <WorkshopCapacityWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="no conference" {...size}>
          <WorkshopCapacityWidget />
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
        <WidgetFrame label="initialization (planning card)" {...size}>
          <WorkshopCapacityWidget conference={init} />
        </WidgetFrame>
        <WidgetFrame label="planning, no workshops (planning card)" {...size}>
          <WorkshopCapacityWidget conference={planningCard} />
        </WidgetFrame>
        <WidgetFrame label="execution (operational)" {...size}>
          <WorkshopCapacityWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="post-conference (summary)" {...size}>
          <WorkshopCapacityWidget conference={post} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}

export const KnownRiskCells: Story = {
  render: () => (
    <MatrixGrid>
      <WidgetFrame label="default 4x2 operational" colSpan={4} rowSpan={2}>
        <WorkshopCapacityWidget conference={dense} />
      </WidgetFrame>
      <WidgetFrame label="min 3x2 operational" colSpan={3} rowSpan={2}>
        <WorkshopCapacityWidget conference={dense} />
      </WidgetFrame>
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The flagged 4x2 DEFAULT cell with the operational view: header + 3 stat cards + workshop list inside only 2 rows (208px inner height).',
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
          <WorkshopCapacityWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="mobile planning card" mode="mobile">
          <WorkshopCapacityWidget conference={planningCard} />
        </WidgetFrame>
        <WidgetFrame label="edit chrome" {...size} editMode>
          <WorkshopCapacityWidget conference={dense} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}
