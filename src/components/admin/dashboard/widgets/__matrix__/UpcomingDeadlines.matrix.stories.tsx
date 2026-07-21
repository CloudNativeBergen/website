import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { UpcomingDeadlinesWidget } from '../UpcomingDeadlinesWidget'
import {
  setMockActionFor,
  mockPending,
  mockFailure,
  mockResolved,
} from './mock-admin-actions'
import { conferenceInPhase, deadlinesDense } from './fixtures'
import {
  WidgetFrame,
  MatrixGrid,
  matrixSizesFor,
  defaultSizeFor,
} from './WidgetFrame'

const TYPE = 'upcoming-deadlines'

const dense = conferenceInPhase('planning', 'upcoming-deadlines/dense')
const empty = conferenceInPhase('planning', 'upcoming-deadlines/empty')
const loading = conferenceInPhase('planning', 'upcoming-deadlines/loading')
const failing = conferenceInPhase('planning', 'upcoming-deadlines/error')
const execution = conferenceInPhase('execution', 'upcoming-deadlines/execution')
const initMasked = conferenceInPhase(
  'initialization',
  'upcoming-deadlines/init-masked-error',
)
const postMasked = conferenceInPhase(
  'post-conference',
  'upcoming-deadlines/post-masked-error',
)

setMockActionFor(dense._id, 'fetchDeadlines', mockResolved(deadlinesDense))
setMockActionFor(empty._id, 'fetchDeadlines', mockResolved([]))
setMockActionFor(loading._id, 'fetchDeadlines', mockPending)
setMockActionFor(failing._id, 'fetchDeadlines', mockFailure)
setMockActionFor(execution._id, 'fetchDeadlines', mockResolved(deadlinesDense))
setMockActionFor(initMasked._id, 'fetchDeadlines', mockFailure)
setMockActionFor(postMasked._id, 'fetchDeadlines', mockFailure)

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/Matrix/UpcomingDeadlines',
  tags: ['matrix'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'State x size matrix for UpcomingDeadlinesWidget inside the real WidgetContainer geometry. Sizes come from the widget registry; per-cell data is forced through the mocked admin-actions module.',
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
          <UpcomingDeadlinesWidget conference={dense} />
        </WidgetFrame>
      ))}
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Every registry size with 8 deadlines (default config caps the list at 5), long names, mixed urgencies and inline action links.',
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
          <UpcomingDeadlinesWidget conference={loading} />
        </WidgetFrame>
        <WidgetFrame label="error" {...size}>
          <UpcomingDeadlinesWidget conference={failing} />
        </WidgetFrame>
        <WidgetFrame label="empty" {...size}>
          <UpcomingDeadlinesWidget conference={empty} />
        </WidgetFrame>
        <WidgetFrame label="dense" {...size}>
          <UpcomingDeadlinesWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="no conference" {...size}>
          <UpcomingDeadlinesWidget />
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
        <WidgetFrame
          label="initialization + REJECTING fetch (masked)"
          {...size}
        >
          <UpcomingDeadlinesWidget conference={initMasked} />
        </WidgetFrame>
        <WidgetFrame
          label="post-conference + REJECTING fetch (masked)"
          {...size}
        >
          <UpcomingDeadlinesWidget conference={postMasked} />
        </WidgetFrame>
        <WidgetFrame label="planning (operational)" {...size}>
          <UpcomingDeadlinesWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="execution (operational)" {...size}>
          <UpcomingDeadlinesWidget conference={execution} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          'PHASE-MASKED ERROR (documented current behaviour): the initialization and post-conference branches return their phase cards BEFORE the loading/error checks, so a rejecting fetch is silently masked in those phases. Both masked cells here use a rejecting fetcher on purpose.',
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
          <UpcomingDeadlinesWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="mobile empty" mode="mobile">
          <UpcomingDeadlinesWidget conference={empty} />
        </WidgetFrame>
        <WidgetFrame label="edit chrome" {...size} editMode showConfigDot>
          <UpcomingDeadlinesWidget conference={dense} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}
