import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { SponsorPipelineWidget } from '../SponsorPipelineWidget'
import {
  setMockActionFor,
  mockPending,
  mockFailure,
  mockResolved,
} from './mock-admin-actions'
import {
  conferenceInPhase,
  sponsorPipelineDense,
  sponsorPipelineEmptyGoalSet,
} from './fixtures'
import {
  WidgetFrame,
  MatrixGrid,
  matrixSizesFor,
  defaultSizeFor,
} from './WidgetFrame'

const TYPE = 'sponsor-pipeline'

// Operational view renders in execution (or planning once deals exist).
const dense = conferenceInPhase('execution', 'sponsor-pipeline/dense')
const empty = conferenceInPhase('execution', 'sponsor-pipeline/empty')
const loading = conferenceInPhase('execution', 'sponsor-pipeline/loading')
const failing = conferenceInPhase('execution', 'sponsor-pipeline/error')
const init = conferenceInPhase('initialization', 'sponsor-pipeline/init')
const planningZero = conferenceInPhase(
  'planning',
  'sponsor-pipeline/planning-zero',
)
const post = conferenceInPhase('post-conference', 'sponsor-pipeline/post')

setMockActionFor(
  dense._id,
  'fetchSponsorPipelineData',
  mockResolved(sponsorPipelineDense),
)
setMockActionFor(empty._id, 'fetchSponsorPipelineData', mockResolved(null))
setMockActionFor(loading._id, 'fetchSponsorPipelineData', mockPending)
setMockActionFor(failing._id, 'fetchSponsorPipelineData', mockFailure)
setMockActionFor(
  init._id,
  'fetchSponsorPipelineData',
  mockResolved(sponsorPipelineEmptyGoalSet),
)
setMockActionFor(
  planningZero._id,
  'fetchSponsorPipelineData',
  mockResolved(sponsorPipelineEmptyGoalSet),
)
setMockActionFor(
  post._id,
  'fetchSponsorPipelineData',
  mockResolved(sponsorPipelineDense),
)

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/Matrix/SponsorPipeline',
  tags: ['matrix'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'State x size matrix for SponsorPipelineWidget inside the real WidgetContainer geometry. Sizes come from the widget registry; per-cell data is forced through the mocked admin-actions module. Dense data includes stages with 5-6 sponsors (logo chips + text pills, one absurdly long name).',
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
          <SponsorPipelineWidget conference={dense} />
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
          <SponsorPipelineWidget conference={loading} />
        </WidgetFrame>
        <WidgetFrame label="error" {...size}>
          <SponsorPipelineWidget conference={failing} />
        </WidgetFrame>
        <WidgetFrame label="empty (null data)" {...size}>
          <SponsorPipelineWidget conference={empty} />
        </WidgetFrame>
        <WidgetFrame label="dense" {...size}>
          <SponsorPipelineWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="no conference" {...size}>
          <SponsorPipelineWidget />
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
        <WidgetFrame label="initialization (prospecting)" {...size}>
          <SponsorPipelineWidget conference={init} />
        </WidgetFrame>
        <WidgetFrame label="planning, zero deals (prospecting)" {...size}>
          <SponsorPipelineWidget conference={planningZero} />
        </WidgetFrame>
        <WidgetFrame label="execution (operational)" {...size}>
          <SponsorPipelineWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="post-conference (final summary)" {...size}>
          <SponsorPipelineWidget conference={post} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}

export const KnownRiskCells: Story = {
  render: () => (
    <MatrixGrid>
      <WidgetFrame label="min/compact operational" colSpan={5} rowSpan={4}>
        <SponsorPipelineWidget conference={dense} />
      </WidgetFrame>
      <WidgetFrame label="oversized (old default)" colSpan={6} rowSpan={9}>
        <SponsorPipelineWidget conference={dense} />
      </WidgetFrame>
    </MatrixGrid>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The two flagged operational cells: 5x4 (compact/min — 4 pipeline stages in 4 rows) and 6x9 (the pre-recalibration default, now a user-chosen oversize — dead space below the stages is inherent to the fixed content).',
      },
    },
  },
}

export const MobileAndEditChrome: Story = {
  render: () => (
    <MatrixGrid>
      <WidgetFrame label="mobile dense" mode="mobile">
        <SponsorPipelineWidget conference={dense} />
      </WidgetFrame>
      <WidgetFrame label="mobile prospecting" mode="mobile">
        <SponsorPipelineWidget conference={planningZero} />
      </WidgetFrame>
      <WidgetFrame
        label="edit chrome"
        colSpan={6}
        rowSpan={5}
        editMode
        showConfigDot
      >
        <SponsorPipelineWidget conference={dense} />
      </WidgetFrame>
    </MatrixGrid>
  ),
}
