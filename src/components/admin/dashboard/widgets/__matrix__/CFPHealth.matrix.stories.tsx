import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CFPHealthWidget } from '../CFPHealthWidget'
import {
  setMockActionFor,
  mockPending,
  mockFailure,
  mockResolved,
} from './mock-admin-actions'
import {
  conferenceInPhase,
  cfpHealthDense,
  cfpHealthSparse,
  cfpHealthZero,
} from './fixtures'
import {
  WidgetFrame,
  MatrixGrid,
  matrixSizesFor,
  defaultSizeFor,
} from './WidgetFrame'

const TYPE = 'cfp-health'

// Operational (trend + format breakdown) view renders in planning phase.
const dense = conferenceInPhase('planning', 'cfp-health/dense')
const sparse = conferenceInPhase('planning', 'cfp-health/sparse')
const zero = conferenceInPhase('planning', 'cfp-health/zero')
const empty = conferenceInPhase('planning', 'cfp-health/empty')
const loading = conferenceInPhase('planning', 'cfp-health/loading')
const failing = conferenceInPhase('planning', 'cfp-health/error')
const init = conferenceInPhase('initialization', 'cfp-health/init')
const execution = conferenceInPhase('execution', 'cfp-health/execution')
const post = conferenceInPhase('post-conference', 'cfp-health/post')

setMockActionFor(dense._id, 'fetchCFPHealth', mockResolved(cfpHealthDense))
setMockActionFor(sparse._id, 'fetchCFPHealth', mockResolved(cfpHealthSparse))
setMockActionFor(zero._id, 'fetchCFPHealth', mockResolved(cfpHealthZero))
setMockActionFor(empty._id, 'fetchCFPHealth', mockResolved(null))
setMockActionFor(loading._id, 'fetchCFPHealth', mockPending)
setMockActionFor(failing._id, 'fetchCFPHealth', mockFailure)
setMockActionFor(init._id, 'fetchCFPHealth', mockResolved(cfpHealthZero))
setMockActionFor(execution._id, 'fetchCFPHealth', mockResolved(cfpHealthDense))
setMockActionFor(post._id, 'fetchCFPHealth', mockResolved(cfpHealthDense))

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/Matrix/CFPHealth',
  tags: ['matrix'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'State x size matrix for CFPHealthWidget inside the real WidgetContainer geometry. Sizes come from the widget registry; per-cell data is forced through the mocked admin-actions module.',
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
          <CFPHealthWidget conference={dense} />
        </WidgetFrame>
      ))}
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Every registry size with dense data: a 14-day submissions trend and 6 talk formats — the trend row is the layout-stress axis in narrow cells.',
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
          <CFPHealthWidget conference={loading} />
        </WidgetFrame>
        <WidgetFrame label="error" {...size}>
          <CFPHealthWidget conference={failing} />
        </WidgetFrame>
        <WidgetFrame label="empty (null data)" {...size}>
          <CFPHealthWidget conference={empty} />
        </WidgetFrame>
        <WidgetFrame label="zero submissions" {...size}>
          <CFPHealthWidget conference={zero} />
        </WidgetFrame>
        <WidgetFrame label="sparse" {...size}>
          <CFPHealthWidget conference={sparse} />
        </WidgetFrame>
        <WidgetFrame label="dense" {...size}>
          <CFPHealthWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="no conference" {...size}>
          <CFPHealthWidget />
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
        <WidgetFrame label="initialization (preparing card)" {...size}>
          <CFPHealthWidget conference={init} />
        </WidgetFrame>
        <WidgetFrame label="planning (operational)" {...size}>
          <CFPHealthWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="execution (complete grid)" {...size}>
          <CFPHealthWidget conference={execution} />
        </WidgetFrame>
        <WidgetFrame label="post-conference (archived)" {...size}>
          <CFPHealthWidget conference={post} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}

export const KnownRiskCells: Story = {
  render: () => (
    <MatrixGrid>
      <WidgetFrame label="14-day trend" colSpan={4} rowSpan={4}>
        <CFPHealthWidget conference={dense} />
      </WidgetFrame>
      <WidgetFrame label="min + 14-day trend" colSpan={3} rowSpan={3}>
        <CFPHealthWidget conference={dense} />
      </WidgetFrame>
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The 4x4 cell with a 14-day trend — the flagged risk cell — plus the true 3x3 minimum with the same data.',
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
          <CFPHealthWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="mobile zero" mode="mobile">
          <CFPHealthWidget conference={zero} />
        </WidgetFrame>
        <WidgetFrame label="edit chrome" {...size} editMode showConfigDot>
          <CFPHealthWidget conference={dense} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}
