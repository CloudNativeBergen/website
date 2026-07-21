import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { RecentActivityFeedWidget } from '../RecentActivityFeedWidget'
import {
  setMockActionFor,
  mockPending,
  mockFailure,
  mockResolved,
} from './mock-admin-actions'
import {
  conferenceInPhase,
  recentActivityDense,
  recentActivitySparse,
} from './fixtures'
import {
  WidgetFrame,
  MatrixGrid,
  matrixSizesFor,
  defaultSizeFor,
} from './WidgetFrame'

const TYPE = 'recent-activity'

const dense = conferenceInPhase('planning', 'recent-activity/dense')
const sparse = conferenceInPhase('planning', 'recent-activity/sparse')
const empty = conferenceInPhase('planning', 'recent-activity/empty')
const loading = conferenceInPhase('planning', 'recent-activity/loading')
const failing = conferenceInPhase('planning', 'recent-activity/error')
const initMasked = conferenceInPhase(
  'initialization',
  'recent-activity/init-masked-error',
)
const postEmpty = conferenceInPhase(
  'post-conference',
  'recent-activity/post-empty',
)
const postData = conferenceInPhase(
  'post-conference',
  'recent-activity/post-data',
)

setMockActionFor(
  dense._id,
  'fetchRecentActivity',
  mockResolved(recentActivityDense),
)
setMockActionFor(
  sparse._id,
  'fetchRecentActivity',
  mockResolved(recentActivitySparse),
)
setMockActionFor(empty._id, 'fetchRecentActivity', mockResolved([]))
setMockActionFor(loading._id, 'fetchRecentActivity', mockPending)
setMockActionFor(failing._id, 'fetchRecentActivity', mockFailure)
setMockActionFor(initMasked._id, 'fetchRecentActivity', mockFailure)
setMockActionFor(postEmpty._id, 'fetchRecentActivity', mockResolved([]))
setMockActionFor(
  postData._id,
  'fetchRecentActivity',
  mockResolved(recentActivitySparse),
)

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/Matrix/RecentActivity',
  tags: ['matrix'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'State x size matrix for RecentActivityFeedWidget inside the real WidgetContainer geometry. Sizes come from the widget registry; per-cell data is forced through the mocked admin-actions module. Dense = 24 items (3 swipeable pages at the default 10/page).',
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
          <RecentActivityFeedWidget conference={dense} />
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
          <RecentActivityFeedWidget conference={loading} />
        </WidgetFrame>
        <WidgetFrame label="error" {...size}>
          <RecentActivityFeedWidget conference={failing} />
        </WidgetFrame>
        <WidgetFrame label="empty" {...size}>
          <RecentActivityFeedWidget conference={empty} />
        </WidgetFrame>
        <WidgetFrame label="sparse (2 items)" {...size}>
          <RecentActivityFeedWidget conference={sparse} />
        </WidgetFrame>
        <WidgetFrame label="dense (24 items)" {...size}>
          <RecentActivityFeedWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="no conference" {...size}>
          <RecentActivityFeedWidget />
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
          <RecentActivityFeedWidget conference={initMasked} />
        </WidgetFrame>
        <WidgetFrame label="post-conference, empty (complete card)" {...size}>
          <RecentActivityFeedWidget conference={postEmpty} />
        </WidgetFrame>
        <WidgetFrame label="post-conference, with data" {...size}>
          <RecentActivityFeedWidget conference={postData} />
        </WidgetFrame>
        <WidgetFrame label="planning (feed)" {...size}>
          <RecentActivityFeedWidget conference={dense} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          'PHASE-MASKED ERROR (documented current behaviour): the initialization branch returns the "Getting Started" card BEFORE the loading/error checks, so a rejecting fetch is silently masked in that phase — that cell uses a rejecting fetcher on purpose.',
      },
    },
  },
}

export const KnownRiskCells: Story = {
  render: () => (
    <MatrixGrid>
      <WidgetFrame label="compact 3x2, dense feed" colSpan={3} rowSpan={2}>
        <RecentActivityFeedWidget conference={dense} />
      </WidgetFrame>
      <WidgetFrame label="narrow-tall 3x10, sparse" colSpan={3} rowSpan={10}>
        <RecentActivityFeedWidget conference={sparse} />
      </WidgetFrame>
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The two flagged cells: 3x2 with a dense paginated feed (header + pager chrome in a 2-row cell) and the 3x10 default with only 2 items (dead space).',
      },
    },
  },
}

export const MobileAndEditChrome: Story = {
  render: () => (
    <MatrixGrid>
      <WidgetFrame label="mobile dense" mode="mobile">
        <RecentActivityFeedWidget conference={dense} />
      </WidgetFrame>
      <WidgetFrame label="mobile empty" mode="mobile">
        <RecentActivityFeedWidget conference={empty} />
      </WidgetFrame>
      <WidgetFrame
        label="edit chrome"
        colSpan={3}
        rowSpan={5}
        editMode
        showConfigDot
      >
        <RecentActivityFeedWidget conference={dense} />
      </WidgetFrame>
    </MatrixGrid>
  ),
}
