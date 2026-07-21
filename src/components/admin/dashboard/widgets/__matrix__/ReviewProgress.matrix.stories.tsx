import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ReviewProgressWidget } from '../ReviewProgressWidget'
import {
  setMockActionFor,
  mockPending,
  mockFailure,
  mockResolved,
} from './mock-admin-actions'
import {
  conferenceInPhase,
  reviewProgressDense,
  reviewProgressSparse,
} from './fixtures'
import {
  WidgetFrame,
  MatrixGrid,
  matrixSizesFor,
  defaultSizeFor,
} from './WidgetFrame'

const TYPE = 'review-progress'

const dense = conferenceInPhase('planning', 'review-progress/dense')
const sparse = conferenceInPhase('planning', 'review-progress/sparse')
const empty = conferenceInPhase('planning', 'review-progress/empty')
const loading = conferenceInPhase('planning', 'review-progress/loading')
const failing = conferenceInPhase('planning', 'review-progress/error')
const init = conferenceInPhase('initialization', 'review-progress/init')
const execution = conferenceInPhase('execution', 'review-progress/execution')
const post = conferenceInPhase('post-conference', 'review-progress/post')
const postNoData = conferenceInPhase(
  'post-conference',
  'review-progress/post-empty',
)

setMockActionFor(
  dense._id,
  'fetchReviewProgress',
  mockResolved(reviewProgressDense),
)
setMockActionFor(
  sparse._id,
  'fetchReviewProgress',
  mockResolved(reviewProgressSparse),
)
setMockActionFor(empty._id, 'fetchReviewProgress', mockResolved(null))
setMockActionFor(loading._id, 'fetchReviewProgress', mockPending)
setMockActionFor(failing._id, 'fetchReviewProgress', mockFailure)
setMockActionFor(init._id, 'fetchReviewProgress', mockResolved(null))
setMockActionFor(
  execution._id,
  'fetchReviewProgress',
  mockResolved(reviewProgressDense),
)
setMockActionFor(
  post._id,
  'fetchReviewProgress',
  mockResolved(reviewProgressDense),
)
setMockActionFor(postNoData._id, 'fetchReviewProgress', mockResolved(null))

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/Matrix/ReviewProgress',
  tags: ['matrix'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'State x size matrix for ReviewProgressWidget inside the real WidgetContainer geometry. Sizes come from the widget registry; per-cell data is forced through the mocked admin-actions module.',
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
          <ReviewProgressWidget conference={dense} />
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
          <ReviewProgressWidget conference={loading} />
        </WidgetFrame>
        <WidgetFrame label="error" {...size}>
          <ReviewProgressWidget conference={failing} />
        </WidgetFrame>
        <WidgetFrame label="empty (null data)" {...size}>
          <ReviewProgressWidget conference={empty} />
        </WidgetFrame>
        <WidgetFrame label="sparse" {...size}>
          <ReviewProgressWidget conference={sparse} />
        </WidgetFrame>
        <WidgetFrame label="dense" {...size}>
          <ReviewProgressWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="no conference" {...size}>
          <ReviewProgressWidget />
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
        <WidgetFrame label="initialization (setup card)" {...size}>
          <ReviewProgressWidget conference={init} />
        </WidgetFrame>
        <WidgetFrame label="planning (operational)" {...size}>
          <ReviewProgressWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="execution (operational)" {...size}>
          <ReviewProgressWidget conference={execution} />
        </WidgetFrame>
        <WidgetFrame label="post-conference (summary)" {...size}>
          <ReviewProgressWidget conference={post} />
        </WidgetFrame>
        <WidgetFrame label="post-conference, no data" {...size}>
          <ReviewProgressWidget conference={postNoData} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}

export const KnownRiskCells: Story = {
  render: () => (
    <MatrixGrid>
      <WidgetFrame label="min operational" colSpan={2} rowSpan={2}>
        <ReviewProgressWidget conference={dense} />
      </WidgetFrame>
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The true 2x2 registry minimum with the full operational view (progress ring + stats + CTA) — the known layout-stress cell for this widget.',
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
          <ReviewProgressWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="mobile error" mode="mobile">
          <ReviewProgressWidget conference={failing} />
        </WidgetFrame>
        <WidgetFrame label="edit chrome" {...size} editMode showConfigDot>
          <ReviewProgressWidget conference={dense} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}
