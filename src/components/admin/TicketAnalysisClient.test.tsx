/**
 * @vitest-environment jsdom
 *
 * A thrown analysis used to reach this component as `null` — the same value
 * "no tickets" produces — and was replaced with `createDefaultAnalysis`, whose
 * performance block is literal zeros with `isOnTrack: true`. A conference badly
 * behind target rendered "Target Progress 0.0% · On Track" beside its real
 * sales numbers, with nothing on screen saying the analysis had failed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

vi.mock('react-apexcharts', () => ({
  __esModule: true,
  default: () => <div data-testid="chart" />,
}))

// The target editor is a tRPC-backed form and is not what is under test here.
vi.mock('./TargetConfigEditor', () => ({
  TargetConfigEditor: () => <div data-testid="target-editor" />,
}))

import { TicketAnalysisClient } from './TicketAnalysisClient'
import type {
  EventTicket,
  SalesTargetConfig,
  TicketAnalysisOutcome,
} from '@/lib/tickets/types'

afterEach(cleanup)

const targetConfig: SalesTargetConfig = {
  enabled: true,
  salesStartDate: '2026-01-01',
  targetCurve: 'linear',
  milestones: [],
}

const tickets = [
  {
    order_id: 1,
    order_date: '2026-02-01T10:00:00Z',
    category: 'Regular',
    sum: '2500',
    crm: { email: 'a@example.com' },
  },
] as unknown as EventTicket[]

const ok: TicketAnalysisOutcome = {
  status: 'ok',
  analysis: {
    capacity: 200,
    progression: [
      {
        date: '2026-02-01',
        actualTickets: 1,
        targetTickets: 20,
        revenue: 2500,
        categoryBreakdown: { Regular: 1 },
        isMilestone: false,
        milestoneLabel: null,
      },
    ],
    performance: {
      currentPercentage: 0.5,
      targetPercentage: 10,
      variance: -9.5,
      isOnTrack: false,
      nextMilestone: null,
    },
    statistics: {
      totalPaidTickets: 1,
      totalRevenue: 2500,
      totalOrders: 1,
      averageTicketPrice: 2500,
      categoryBreakdown: { Regular: 1 },
      sponsorTickets: 0,
      speakerTickets: 0,
    },
  },
}

function renderClient(analysisData: {
  paidAnalysis: TicketAnalysisOutcome
  allTicketsAnalysis: TicketAnalysisOutcome
}) {
  return render(
    <TicketAnalysisClient
      ticketData={{
        allTickets: tickets,
        paidTickets: tickets,
        freeTickets: [],
      }}
      participantTally={{
        participants: 1,
        addOnsWithSeat: 0,
        addOnsWithoutSeat: 0,
        repeatTickets: 0,
        certain: true,
      }}
      conference={{ _id: 'c1', ticketCapacity: 200 }}
      analysisData={analysisData}
      freeTicketAllocation={{
        sponsors: { allocated: 0, claimed: 0, fromProvider: false, status: '' },
        speakers: { allocated: 0, claimed: 0, fromProvider: false, status: '' },
        organizers: {
          allocated: 0,
          claimed: 0,
          fromProvider: false,
          status: '',
        },
        totalAllocated: 0,
        totalClaimed: 0,
      }}
      defaultTargetConfig={targetConfig}
    />,
  )
}

describe('a failed analysis', () => {
  it('renders as a failure, not as a zeroed analysis', () => {
    renderClient({
      paidAnalysis: { status: 'unavailable', error: 'curve blew up' },
      allTicketsAnalysis: ok,
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sales analysis unavailable',
    )
    expect(screen.getByText('curve blew up')).toBeInTheDocument()

    // None of the substituted zeros, and no verdict at all.
    expect(screen.queryByText('Target Progress')).not.toBeInTheDocument()
    expect(screen.queryByText(/On Track/)).not.toBeInTheDocument()
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument()
    expect(screen.queryByText('Unique Participants')).not.toBeInTheDocument()
  })

  it('fails the page even when only the all-tickets analysis threw', () => {
    renderClient({
      paidAnalysis: ok,
      allTicketsAnalysis: { status: 'unavailable', error: 'bad date' },
    })

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Target Progress')).not.toBeInTheDocument()
  })

  it('leaves the target config editor reachable — it needs no analysis', () => {
    renderClient({
      paidAnalysis: { status: 'unavailable', error: 'curve blew up' },
      allTicketsAnalysis: ok,
    })

    expect(screen.getByTestId('target-editor')).toBeInTheDocument()
  })
})

describe('an empty analysis', () => {
  it('is still a real zero and renders the cards', () => {
    renderClient({
      paidAnalysis: { status: 'empty' },
      allTicketsAnalysis: { status: 'empty' },
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Target Progress')).toBeInTheDocument()
  })
})

describe('a successful analysis', () => {
  it('renders the cards with no failure notice', () => {
    renderClient({ paidAnalysis: ok, allTicketsAnalysis: ok })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Target Progress')).toBeInTheDocument()
    expect(screen.getByText(/Behind \(-9\.5%\)/)).toBeInTheDocument()
  })
})
