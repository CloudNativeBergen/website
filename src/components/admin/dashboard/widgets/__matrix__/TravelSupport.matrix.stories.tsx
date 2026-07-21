import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { TravelSupportQueueWidget } from '../TravelSupportQueueWidget'
import {
  setMockActionFor,
  mockPending,
  mockFailure,
  mockResolved,
} from './mock-admin-actions'
import {
  conferenceInPhase,
  travelSupportPending,
  travelSupportQuiet,
} from './fixtures'
import {
  WidgetFrame,
  MatrixGrid,
  matrixSizesFor,
  defaultSizeFor,
} from './WidgetFrame'

const TYPE = 'travel-support'

// Operational view renders in execution (init/planning show the setup card
// while totalRequested is 0).
const dense = conferenceInPhase('execution', 'travel-support/dense')
const quiet = conferenceInPhase('execution', 'travel-support/quiet')
const empty = conferenceInPhase('execution', 'travel-support/empty')
const loading = conferenceInPhase('execution', 'travel-support/loading')
const failing = conferenceInPhase('execution', 'travel-support/error')
const init = conferenceInPhase('initialization', 'travel-support/init')
const planningCard = conferenceInPhase('planning', 'travel-support/planning')
const post = conferenceInPhase('post-conference', 'travel-support/post')

setMockActionFor(
  dense._id,
  'fetchTravelSupport',
  mockResolved(travelSupportPending),
)
setMockActionFor(
  quiet._id,
  'fetchTravelSupport',
  mockResolved(travelSupportQuiet),
)
setMockActionFor(empty._id, 'fetchTravelSupport', mockResolved(null))
setMockActionFor(loading._id, 'fetchTravelSupport', mockPending)
setMockActionFor(failing._id, 'fetchTravelSupport', mockFailure)
setMockActionFor(
  init._id,
  'fetchTravelSupport',
  mockResolved(travelSupportQuiet),
)
setMockActionFor(planningCard._id, 'fetchTravelSupport', mockResolved(null))
setMockActionFor(
  post._id,
  'fetchTravelSupport',
  mockResolved(travelSupportPending),
)

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/Matrix/TravelSupport',
  tags: ['matrix'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'State x size matrix for TravelSupportQueueWidget inside the real WidgetContainer geometry. Sizes come from the widget registry; per-cell data is forced through the mocked admin-actions module.',
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
          <TravelSupportQueueWidget conference={dense} />
        </WidgetFrame>
      ))}
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Every registry size with 6 pending requests (long speaker names), budget bar at 64% and the amber pending-approvals callout.',
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
          <TravelSupportQueueWidget conference={loading} />
        </WidgetFrame>
        <WidgetFrame label="error" {...size}>
          <TravelSupportQueueWidget conference={failing} />
        </WidgetFrame>
        <WidgetFrame label="empty (null data)" {...size}>
          <TravelSupportQueueWidget conference={empty} />
        </WidgetFrame>
        <WidgetFrame label="quiet (no pending)" {...size}>
          <TravelSupportQueueWidget conference={quiet} />
        </WidgetFrame>
        <WidgetFrame label="dense (pending queue)" {...size}>
          <TravelSupportQueueWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="no conference" {...size}>
          <TravelSupportQueueWidget />
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
        <WidgetFrame label="initialization + budget (setup card)" {...size}>
          <TravelSupportQueueWidget conference={init} />
        </WidgetFrame>
        <WidgetFrame label="planning, no data (setup card)" {...size}>
          <TravelSupportQueueWidget conference={planningCard} />
        </WidgetFrame>
        <WidgetFrame label="execution (operational)" {...size}>
          <TravelSupportQueueWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="post-conference (final summary)" {...size}>
          <TravelSupportQueueWidget conference={post} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}

export const KnownRiskCells: Story = {
  render: () => (
    <MatrixGrid>
      <WidgetFrame label="min 3x3 with pending queue" colSpan={3} rowSpan={3}>
        <TravelSupportQueueWidget conference={dense} />
      </WidgetFrame>
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The flagged 3x3 cell with pending requests: amber callout + stat cards + budget bar + request list competing for 3 rows.',
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
          <TravelSupportQueueWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="mobile quiet" mode="mobile">
          <TravelSupportQueueWidget conference={quiet} />
        </WidgetFrame>
        <WidgetFrame label="edit chrome" {...size} editMode showConfigDot>
          <TravelSupportQueueWidget conference={dense} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}
