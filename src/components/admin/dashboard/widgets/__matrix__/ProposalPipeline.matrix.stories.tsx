import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ProposalPipelineWidget } from '../ProposalPipelineWidget'
import {
  setMockActionFor,
  mockPending,
  mockFailure,
  mockResolved,
} from './mock-admin-actions'
import {
  conferenceInPhase,
  proposalPipelineDense,
  proposalPipelineSparse,
} from './fixtures'
import {
  WidgetFrame,
  MatrixGrid,
  matrixSizesFor,
  defaultSizeFor,
} from './WidgetFrame'

const TYPE = 'proposal-pipeline'

// Operational view only renders in execution (init/planning show the CFP setup
// card, post-conference shows the summary), so dense cells use execution.
const dense = conferenceInPhase('execution', 'proposal-pipeline/dense')
const sparse = conferenceInPhase('execution', 'proposal-pipeline/sparse')
const empty = conferenceInPhase('execution', 'proposal-pipeline/empty')
const loading = conferenceInPhase('execution', 'proposal-pipeline/loading')
const failing = conferenceInPhase('execution', 'proposal-pipeline/error')
const init = conferenceInPhase('initialization', 'proposal-pipeline/init')
const planningEarly = conferenceInPhase(
  'planning',
  'proposal-pipeline/planning',
)
const post = conferenceInPhase('post-conference', 'proposal-pipeline/post')

setMockActionFor(
  dense._id,
  'fetchProposalPipeline',
  mockResolved(proposalPipelineDense),
)
setMockActionFor(
  sparse._id,
  'fetchProposalPipeline',
  mockResolved(proposalPipelineSparse),
)
setMockActionFor(empty._id, 'fetchProposalPipeline', mockResolved(null))
setMockActionFor(loading._id, 'fetchProposalPipeline', mockPending)
setMockActionFor(failing._id, 'fetchProposalPipeline', mockFailure)
setMockActionFor(init._id, 'fetchProposalPipeline', mockResolved(null))
setMockActionFor(
  planningEarly._id,
  'fetchProposalPipeline',
  mockResolved(proposalPipelineSparse),
)
setMockActionFor(
  post._id,
  'fetchProposalPipeline',
  mockResolved(proposalPipelineDense),
)

const meta = {
  title: 'Systems/Proposals/Admin/Dashboard/Matrix/ProposalPipeline',
  tags: ['matrix'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'State x size matrix for ProposalPipelineWidget inside the real WidgetContainer geometry. Sizes come from the widget registry; per-cell data is forced through the mocked admin-actions module.',
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
          <ProposalPipelineWidget conference={dense} />
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
          <ProposalPipelineWidget conference={loading} />
        </WidgetFrame>
        <WidgetFrame label="error" {...size}>
          <ProposalPipelineWidget conference={failing} />
        </WidgetFrame>
        <WidgetFrame label="empty (null data)" {...size}>
          <ProposalPipelineWidget conference={empty} />
        </WidgetFrame>
        <WidgetFrame label="sparse" {...size}>
          <ProposalPipelineWidget conference={sparse} />
        </WidgetFrame>
        <WidgetFrame label="dense" {...size}>
          <ProposalPipelineWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="no conference" {...size}>
          <ProposalPipelineWidget />
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
        <WidgetFrame label="initialization (CFP setup card)" {...size}>
          <ProposalPipelineWidget conference={init} />
        </WidgetFrame>
        <WidgetFrame label="planning + early submissions" {...size}>
          <ProposalPipelineWidget conference={planningEarly} />
        </WidgetFrame>
        <WidgetFrame label="execution (operational)" {...size}>
          <ProposalPipelineWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="post-conference (summary)" {...size}>
          <ProposalPipelineWidget conference={post} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          'Phase branches at default size. Planning shows the setup card with the "Early Submissions" box because total > 0.',
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
          <ProposalPipelineWidget conference={dense} />
        </WidgetFrame>
        <WidgetFrame label="mobile loading" mode="mobile">
          <ProposalPipelineWidget conference={loading} />
        </WidgetFrame>
        <WidgetFrame label="edit chrome" {...size} editMode showConfigDot>
          <ProposalPipelineWidget conference={dense} />
        </WidgetFrame>
      </MatrixGrid>
    )
  },
}
