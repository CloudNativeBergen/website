/**
 * @vitest-environment jsdom
 *
 * The two headline figures this card set got wrong: "N / capacity … % of
 * capacity" read as venue occupancy when `ticketCapacity` is the SELLABLE
 * total (comps excluded, per its schema definition), and the number an
 * organizer actually wants — how many seats are taken — was computed in
 * `processor.ts` and displayed nowhere.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

// ApexCharts needs a real layout engine; the cards under test do not.
vi.mock('react-apexcharts', () => ({
  __esModule: true,
  default: () => <div data-testid="chart" />,
}))

import { TicketSalesChartDisplay } from './TicketSalesChartDisplay'
import type { ParticipantTally } from '@/lib/tickets/participants'
import type {
  FreeTicketAllocation,
  FreeTicketCount,
} from '@/lib/tickets/freeAllocation'
import type { TicketAnalysisResult } from '@/lib/tickets/types'

afterEach(cleanup)

const analysis = (capacity: number, sold = 40): TicketAnalysisResult => ({
  capacity,
  progression: [
    {
      date: '2026-03-01',
      actualTickets: sold,
      targetTickets: 50,
      revenue: 100000,
      categoryBreakdown: { Regular: sold },
      isMilestone: false,
      milestoneLabel: null,
    },
  ],
  performance: {
    currentPercentage: capacity > 0 ? (sold / capacity) * 100 : 0,
    targetPercentage: 25,
    variance: -5,
    isOnTrack: true,
    nextMilestone: null,
  },
  statistics: {
    totalPaidTickets: sold,
    totalRevenue: 100000,
    totalOrders: 35,
    averageTicketPrice: 2500,
    categoryBreakdown: { Regular: sold },
    sponsorTickets: 10,
    speakerTickets: 8,
  },
})

const tally = (
  overrides: Partial<ParticipantTally> = {},
): ParticipantTally => ({
  participants: 44,
  addOnsWithSeat: 6,
  addOnsWithoutSeat: 0,
  repeatTickets: 3,
  certain: true,
  ...overrides,
})

function renderCards(
  capacity: number,
  t: ParticipantTally = tally(),
  freeTicketAllocation?: FreeTicketAllocation,
) {
  const result = analysis(capacity)
  return render(
    <TicketSalesChartDisplay
      analysis={result}
      paidAnalysis={result}
      participantTally={t}
      freeTicketAllocation={freeTicketAllocation}
    />,
  )
}

const row = (allocated: FreeTicketCount, claimed: FreeTicketCount) => ({
  allocated,
  claimed,
  fromProvider: false,
  status: '',
})

describe('sellable-ticket progress', () => {
  it('names the figure as tickets for sale, not capacity', () => {
    renderCards(200)

    expect(screen.getByText('Sellable Tickets Sold')).toBeInTheDocument()
    expect(screen.getByText('40 / 200')).toBeInTheDocument()
    expect(
      screen.getByText('20.0% of tickets for sale (comps excluded)'),
    ).toBeInTheDocument()
    // The arithmetic is unchanged: comps are NOT folded in.
    expect(screen.queryByText('58 / 200')).not.toBeInTheDocument()
  })

  it('says no capacity is set rather than inventing one', () => {
    renderCards(0)

    expect(screen.getByText('No capacity set')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    // The old fallback rendered 250 as though the organizer had chosen it.
    expect(screen.queryByText(/250/)).not.toBeInTheDocument()
    expect(screen.queryByText(/% of tickets for sale/)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/)
  })
})

describe('seats used', () => {
  it('counts every seat held, comps included, as a plain count', () => {
    renderCards(200)

    expect(screen.getByText('Seats Used')).toBeInTheDocument()
    // 44 people + 3 repeat seats; the 6 add-ons seat nobody.
    expect(screen.getByText('47')).toBeInTheDocument()
    expect(
      screen.getByText('Admitting tickets, comps included'),
    ).toBeInTheDocument()
  })

  it('marks the count approximate when a ticket type has no declared role', () => {
    renderCards(200, tally({ certain: false }))

    expect(screen.getByText('≈ 47')).toBeInTheDocument()
    // What the count rests on is `admits`, declared per ticket type. The copy
    // used to blame the discount list, which decides `comp` and cannot move
    // this number at all.
    expect(
      screen.getByText('Assumes every undeclared ticket type seats someone'),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/discount codes unavailable/)
  })
})

describe('free tickets claimed', () => {
  it('states the total over the rows it can count, and names them', () => {
    renderCards(200, tally(), {
      sponsors: row(24, 9),
      speakers: row(18, 12),
      // Uncountable on every tenant: an organizer comp is indistinguishable
      // from any other free ticket.
      organizers: row(9, 'unknown'),
      totalAllocated: 51,
      totalClaimed: 21,
      claimedAllocated: 42,
      claimedCovers: ['sponsors', 'speakers'],
    })

    // The card used to read "? / 51" on every tenant, forever, because one
    // uncountable row poisoned the sum.
    expect(screen.getByText('21 / 42')).toBeInTheDocument()
    expect(screen.queryByText('? / 51')).not.toBeInTheDocument()
    expect(
      screen.getByText('50.0% claimed · sponsors and speakers only'),
    ).toBeInTheDocument()
  })

  it('still refuses a number when nothing can be counted', () => {
    renderCards(200, tally(), {
      sponsors: row(24, 'unknown'),
      speakers: row(18, 'unknown'),
      organizers: row(9, 'unknown'),
      totalAllocated: 51,
      totalClaimed: 'unknown',
      claimedAllocated: 'unknown',
      claimedCovers: [],
    })

    expect(screen.getByText('? / ?')).toBeInTheDocument()
    expect(screen.getByText('No category can be counted')).toBeInTheDocument()
  })
})
