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

function renderCards(capacity: number, t: ParticipantTally = tally()) {
  const result = analysis(capacity)
  return render(
    <TicketSalesChartDisplay
      analysis={result}
      paidAnalysis={result}
      participantTally={t}
    />,
  )
}

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

  it('marks the count approximate when the discount list was unreadable', () => {
    renderCards(200, tally({ certain: false }))

    expect(screen.getByText('≈ 47')).toBeInTheDocument()
  })
})
