import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { QuickActionsWidget } from '../QuickActionsWidget'
import {
  setMockActionFor,
  mockPending,
  mockFailure,
  mockResolved,
} from './mock-admin-actions'
import {
  conferenceInPhase,
  quickActionsDense,
  quickActionsSparse,
} from './fixtures'
import {
  WidgetFrame,
  MatrixGrid,
  matrixSizesFor,
  defaultSizeFor,
} from './WidgetFrame'

const TYPE = 'quick-actions'

const dense = conferenceInPhase('planning', 'quick-actions/dense')
const sparse = conferenceInPhase('planning', 'quick-actions/sparse')
const empty = conferenceInPhase('planning', 'quick-actions/empty')
const loading = conferenceInPhase('planning', 'quick-actions/loading')
const failing = conferenceInPhase('planning', 'quick-actions/error')

setMockActionFor(
  dense._id,
  'fetchQuickActions',
  mockResolved(quickActionsDense),
)
setMockActionFor(
  sparse._id,
  'fetchQuickActions',
  mockResolved(quickActionsSparse),
)
setMockActionFor(empty._id, 'fetchQuickActions', mockResolved([]))
setMockActionFor(loading._id, 'fetchQuickActions', mockPending)
setMockActionFor(failing._id, 'fetchQuickActions', mockFailure)

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/Matrix/QuickActions',
  tags: ['matrix'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'State x size matrix for QuickActionsWidget inside the real WidgetContainer geometry. Sizes come from the widget registry; per-cell data is forced through the mocked admin-actions module.',
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
          <QuickActionsWidget conference={dense} />
        </WidgetFrame>
      ))}
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Every registry size (true min, default, all presets, true max) with dense data: 6 actions, long labels, a 99+ badge.',
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
          <QuickActionsWidget conference={loading} />
        </WidgetFrame>
        <WidgetFrame label="error" {...size}>
          <QuickActionsWidget conference={failing} />
        </WidgetFrame>
        <WidgetFrame label="empty" {...size}>
          <QuickActionsWidget conference={empty} />
        </WidgetFrame>
        <WidgetFrame label="sparse" {...size}>
          <QuickActionsWidget conference={sparse} />
        </WidgetFrame>
        <WidgetFrame label="dense" {...size}>
          <QuickActionsWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="no conference" {...size}>
          <QuickActionsWidget />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          'Every useWidgetData state at the registry default size, plus the null-conference no-op (renders the empty state).',
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
          <QuickActionsWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="mobile loading" mode="mobile">
          <QuickActionsWidget conference={loading} />
        </WidgetFrame>
        <WidgetFrame label="edit chrome" {...size} editMode>
          <QuickActionsWidget conference={dense} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          'Mobile auto-height column (no size containment, 361px) and the edit-mode chrome with the mac-dots overlay + h3 indent hack.',
      },
    },
  },
}
