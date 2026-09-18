/**
 * @vitest-environment jsdom
 *
 * Four things this card set presented as facts when they were not:
 *
 *  1. "On Track" printed beside a red downward arrow and a negative variance.
 *  2. An empty analysis drawing an empty chart whose screen-reader summary
 *     asserted "Sales target for the period: 0".
 *  3. The tooltip formatter dereferencing a progression point that is not there.
 *  4. The "include free tickets" toggle silently making the chart and the cards
 *     above it describe different populations.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

const captured = vi.hoisted(() => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: null as any,
}))

// ApexCharts needs a real layout engine; capturing the options it is handed is
// the only way to exercise the tooltip formatter the way ApexCharts calls it.
vi.mock('react-apexcharts', () => ({
  __esModule: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: any) => {
    captured.options = props.options
    return <div data-testid="chart" />
  },
}))

import { TicketSalesChartDisplay } from './TicketSalesChartDisplay'
import type { TicketAnalysisResult } from '@/lib/tickets/types'

afterEach(() => {
  cleanup()
  captured.options = null
})

const point = {
  date: '2026-03-01',
  actualTickets: 40,
  targetTickets: 50,
  revenue: 100000,
  categoryBreakdown: { Regular: 40 },
  isMilestone: false,
  milestoneLabel: null,
}

const analysis = (variance: number, isOnTrack: boolean): TicketAnalysisResult =>
  ({
    capacity: 200,
    progression: [point],
    performance: {
      currentPercentage: 20,
      targetPercentage: 20 - variance,
      variance,
      isOnTrack,
      nextMilestone: null,
    },
    statistics: {
      totalPaidTickets: 40,
      totalRevenue: 100000,
      totalOrders: 35,
      averageTicketPrice: 2500,
      categoryBreakdown: { Regular: 40 },
      sponsorTickets: 0,
      speakerTickets: 0,
    },
  }) satisfies TicketAnalysisResult

const empty: TicketAnalysisResult = {
  ...analysis(0, true),
  progression: [],
}

describe('target progress verdict', () => {
  it('keeps a conference inside the tolerance on track, whatever the stored flag says', () => {
    // The exact live case: -4.2%, inside the band, with a stale `false` on the
    // record. The card must not draw its verdict from a second rule.
    const result = analysis(-4.2, false)
    render(<TicketSalesChartDisplay analysis={result} paidAnalysis={result} />)

    expect(screen.getByText(/On Track \(-4\.2%\)/)).toBeInTheDocument()
    expect(screen.queryByText(/Behind/)).not.toBeInTheDocument()
  })

  it('says Behind once the variance leaves the tolerance', () => {
    const result = analysis(-12, true)
    render(<TicketSalesChartDisplay analysis={result} paidAnalysis={result} />)

    expect(screen.getByText(/Behind \(-12\.0%\)/)).toBeInTheDocument()
    expect(screen.queryByText(/On Track/)).not.toBeInTheDocument()
  })

  it('says On Track when the variance is not negative', () => {
    const result = analysis(4.3, true)
    render(<TicketSalesChartDisplay analysis={result} paidAnalysis={result} />)

    expect(screen.getByText(/On Track \(\+4\.3%\)/)).toBeInTheDocument()
    expect(screen.queryByText(/Behind/)).not.toBeInTheDocument()
  })

  it('ignores a stored flag that disagrees in the other direction too', () => {
    const result = analysis(6, false)
    render(<TicketSalesChartDisplay analysis={result} paidAnalysis={result} />)

    expect(screen.getByText(/On Track \(\+6\.0%\)/)).toBeInTheDocument()
  })
})

describe('empty progression', () => {
  it('renders the empty state instead of a chart with an invented target', () => {
    render(<TicketSalesChartDisplay analysis={empty} paidAnalysis={empty} />)

    expect(screen.getByText('No chart data available')).toBeInTheDocument()
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
    // The screen-reader summary must not assert a target of 0.
    expect(document.body.textContent).not.toMatch(/Sales target for the period/)
    expect(
      screen.getByText(/no sales progression to chart yet/i),
    ).toBeInTheDocument()
  })

  it('keeps the stat cards, which are computed from the paid analysis', () => {
    const paid = analysis(-4.2, true)
    render(<TicketSalesChartDisplay analysis={empty} paidAnalysis={paid} />)

    expect(screen.getByText('Sellable Tickets Sold')).toBeInTheDocument()
    expect(screen.getByText('40 / 200')).toBeInTheDocument()
  })
})

describe('tooltip formatter', () => {
  it('returns empty rather than throwing on an index with no progression point', async () => {
    const result = analysis(0, true)
    render(<TicketSalesChartDisplay analysis={result} paidAnalysis={result} />)

    await screen.findByTestId('chart')
    const custom = captured.options.tooltip.custom

    expect(() => custom({ dataPointIndex: 7 })).not.toThrow()
    expect(custom({ dataPointIndex: 7 })).toBe('')
    // The real point still renders.
    expect(custom({ dataPointIndex: 0 })).toContain('40')
  })

  it('labels the sold row for the population actually charted', async () => {
    const result = analysis(0, true)
    const { rerender } = render(
      <TicketSalesChartDisplay
        analysis={result}
        paidAnalysis={result}
        includeFreeTickets={false}
      />,
    )
    await screen.findByTestId('chart')
    expect(captured.options.tooltip.custom({ dataPointIndex: 0 })).toContain(
      'Paid tickets:',
    )
    // "Total Sold" was the old label, printed over a number that holds ALL
    // tickets whenever the toggle is on.
    expect(
      captured.options.tooltip.custom({ dataPointIndex: 0 }),
    ).not.toContain('Total Sold')

    rerender(
      <TicketSalesChartDisplay
        analysis={result}
        paidAnalysis={result}
        includeFreeTickets={true}
      />,
    )
    expect(captured.options.tooltip.custom({ dataPointIndex: 0 })).toContain(
      'All tickets:',
    )
  })
})

describe('toggle scope', () => {
  it('states that the chart is paid-only while the toggle is off', () => {
    const result = analysis(0, true)
    render(
      <TicketSalesChartDisplay
        analysis={result}
        paidAnalysis={result}
        includeFreeTickets={false}
        onToggleChange={() => {}}
      />,
    )

    expect(
      screen.getByText('Paid tickets only, like the cards above.'),
    ).toBeInTheDocument()
  })

  it('says the cards do NOT follow the toggle once free tickets are included', () => {
    const result = analysis(0, true)
    render(
      <TicketSalesChartDisplay
        analysis={result}
        paidAnalysis={result}
        includeFreeTickets={true}
        onToggleChange={() => {}}
      />,
    )

    expect(
      screen.getByText(
        'All tickets, paid and free. The cards above count paid tickets only.',
      ),
    ).toBeInTheDocument()
  })
})
