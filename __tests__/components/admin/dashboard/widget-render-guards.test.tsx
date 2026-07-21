/**
 * @vitest-environment jsdom
 *
 * Render-guard regressions for dashboard widgets:
 *  - ProposalPipelineWidget must not render a stray literal "0" when
 *    `data.total` is 0 (the classic `{count && <X/>}` JSX pitfall).
 *  - TravelSupportQueueWidget must not render NaN%/Infinity% when the
 *    conference has no travel budget configured, and its post-conference
 *    tiles must use the approved aggregates (not the pending queue).
 */
import { render, screen } from '@testing-library/react'
import type { Conference } from '@/lib/conference/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any

const mockFetchProposalPipeline = vi.fn<AnyFn>()
const mockFetchTravelSupport = vi.fn<AnyFn>()
vi.mock('@/app/(admin)/admin/actions', () => ({
  fetchProposalPipeline: (...args: unknown[]) =>
    mockFetchProposalPipeline(...args),
  fetchTravelSupport: (...args: unknown[]) => mockFetchTravelSupport(...args),
}))

const mockGetCurrentPhase = vi.fn<AnyFn>()
vi.mock('@/lib/conference/phase', () => ({
  getCurrentPhase: (...args: unknown[]) => mockGetCurrentPhase(...args),
}))

import { ProposalPipelineWidget } from '@/components/admin/dashboard/widgets/ProposalPipelineWidget'
import { TravelSupportQueueWidget } from '@/components/admin/dashboard/widgets/TravelSupportQueueWidget'

const conference = {
  _id: 'conf-1',
  title: 'Test Conference',
  cfpStartDate: '2099-01-01',
  cfpEndDate: '2099-02-01',
} as unknown as Conference

describe('ProposalPipelineWidget', () => {
  it('does not render a stray "0" in planning phase when total is 0', async () => {
    mockGetCurrentPhase.mockReturnValue('planning')
    mockFetchProposalPipeline.mockResolvedValue({
      submitted: 0,
      accepted: 0,
      rejected: 0,
      confirmed: 0,
      total: 0,
      acceptanceRate: 0,
      pendingDecisions: 0,
      distinctSpeakers: 0,
    })

    render(<ProposalPipelineWidget conference={conference} />)

    await screen.findByText('CFP Planning')
    expect(screen.queryByText('Early Submissions')).toBeNull()
    // The old `{data?.total && ...}` guard leaked a literal "0" text node
    expect(screen.queryByText('0')).toBeNull()
  })
})

describe('TravelSupportQueueWidget', () => {
  it('renders an em dash instead of NaN% when no budget is configured', async () => {
    mockGetCurrentPhase.mockReturnValue('post-conference')
    mockFetchTravelSupport.mockResolvedValue({
      pendingApprovals: 1,
      approvedCount: 2,
      totalRequested: 16000,
      totalApproved: 10000,
      budgetAllocated: 0,
      averageRequest: 5333,
      requests: [
        {
          id: 'ts1',
          speaker: 'Alice',
          amount: 5000,
          status: 'submitted',
          submittedAt: '2 days ago',
        },
      ],
    })

    const { container } = render(
      <TravelSupportQueueWidget conference={conference} />,
    )

    await screen.findByText('Budget Used')
    expect(container.textContent).not.toContain('NaN')
    expect(container.textContent).not.toContain('Infinity')
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('post-conference tiles use approved aggregates, not the pending queue', async () => {
    mockGetCurrentPhase.mockReturnValue('post-conference')
    mockFetchTravelSupport.mockResolvedValue({
      pendingApprovals: 1,
      approvedCount: 3,
      totalRequested: 30000,
      totalApproved: 15000,
      budgetAllocated: 50000,
      averageRequest: 6000,
      requests: [
        // Only ONE pending request — must not drive "Speakers Supported"
        {
          id: 'ts1',
          speaker: 'Alice',
          amount: 5000,
          status: 'submitted',
          submittedAt: '2 days ago',
        },
      ],
    })

    render(<TravelSupportQueueWidget conference={conference} />)

    await screen.findByText('Speakers Supported')
    // 3 approved/paid speakers, not the 1 pending request
    expect(screen.getByText('3')).toBeInTheDocument()
    // Budget used = 15000/50000 = 30%
    expect(screen.getByText('30%')).toBeInTheDocument()
  })
})
