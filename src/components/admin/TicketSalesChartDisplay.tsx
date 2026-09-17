'use client'

import React, { useMemo, type ReactNode } from 'react'
import { formatChartDateShort } from '@/lib/time'
import dynamic from 'next/dynamic'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type {
  TicketAnalysisResult,
  SalesTargetConfig,
} from '@/lib/tickets/types'
import {
  freeTicketClaimRate,
  type FreeTicketAllocation,
} from '@/lib/tickets/freeAllocation'
import { seatsUsed, type ParticipantTally } from '@/lib/tickets/participants'
import {
  adaptForChart,
  createTooltipContent,
  createConfigAnnotations,
  convertAnnotationsToApexFormat,
} from '@/lib/tickets/chart-adapter'
import { calculateCapacityPercentage } from '@/lib/tickets/utils'
import { formatCurrency } from '@/lib/format'
import {
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { TicketVisibilityToggle } from './TicketVisibilityToggle'

const PERFORMANCE_THRESHOLDS = {
  EXCELLENT: 10,
  GOOD: 0,
} as const

const CHART_COLORS = {
  GRID_BORDER: '#F3F4F6',
  AXIS_BORDER: '#E5E7EB',
  TEXT_PRIMARY: '#6B7280',
  TODAY_MARKER: '#6B7280',
  TODAY_BACKGROUND: '#F9FAFB',
} as const

const CHART_CONFIG = {
  ANIMATION_SPEED: 800,
  TARGET_LINE_WIDTH: 6,
  TARGET_DASH_ARRAY: 10,
  TARGET_OPACITY: 0.6,
  COLUMN_WIDTH: '65%',
  BORDER_RADIUS: 3,
} as const

const Chart = dynamic(() => import('react-apexcharts'), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
    </div>
  ),
})

interface ChartProps {
  analysis: TicketAnalysisResult
  paidAnalysis: TicketAnalysisResult
  salesConfig?: SalesTargetConfig
  className?: string

  includeFreeTickets?: boolean
  onToggleChange?: (include: boolean) => void
  paidCount?: number
  freeCount?: number
  /**
   * The one participant rule, already applied: unique emails across every
   * ticket that seats someone. Absent means nothing was counted (0 people),
   * never "count it here" — see `tallyParticipants`.
   */
  participantTally?: ParticipantTally
  freeTicketAllocation?: FreeTicketAllocation
  /**
   * Rendered INSTEAD of the chart below the `sm` breakpoint. A stacked
   * six-series column chart is not readable at 345×300; the page passes the
   * category breakdown table, which carries the same numbers in a form that
   * needs no hover. Without a fallback the chart renders at every width.
   */
  chartFallback?: ReactNode
}

const SM_BREAKPOINT = '(min-width: 640px)'

const formatDate = (dateStr: string): string => formatChartDateShort(dateStr)

const getStatusColors = (variance: number): string => {
  if (variance >= PERFORMANCE_THRESHOLDS.EXCELLENT) {
    return 'text-green-600 dark:text-green-400'
  }
  if (variance >= PERFORMANCE_THRESHOLDS.GOOD) {
    return 'text-yellow-600 dark:text-yellow-400'
  }
  return 'text-red-600 dark:text-red-400'
}

const getStatusIcon = (variance: number) => {
  if (variance >= PERFORMANCE_THRESHOLDS.EXCELLENT) {
    return ArrowTrendingUpIcon
  }
  if (variance >= PERFORMANCE_THRESHOLDS.GOOD) {
    return ExclamationTriangleIcon
  }
  return ArrowTrendingDownIcon
}

const EMPTY_TALLY: ParticipantTally = {
  participants: 0,
  addOnsWithSeat: 0,
  addOnsWithoutSeat: 0,
  repeatTickets: 0,
  certain: true,
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** A free-ticket count, or the admission that we have none. Never a zero. */
const countLabel = (count: number | 'unknown') =>
  count === 'unknown' ? '?' : `${count}`

/**
 * What the participant number LEFT OUT, in the terms it was actually counted.
 *
 * The old copy called every ticket beyond the headcount a "ticket upgrade",
 * which was wrong for the two things that actually produce the gap: a workshop
 * add-on bought by someone who already holds a seat, and one email holding
 * several seats. They are reported as separate figures because they are
 * separate facts.
 */
function participantNote(tally: ParticipantTally): string {
  const left: string[] = []
  if (tally.addOnsWithSeat > 0) {
    left.push(`${plural(tally.addOnsWithSeat, 'add-on')} held by an attendee`)
  }
  if (tally.addOnsWithoutSeat > 0) {
    left.push(`${plural(tally.addOnsWithoutSeat, 'add-on')} with no ticket`)
  }
  if (tally.repeatTickets > 0) {
    left.push(plural(tally.repeatTickets, 'repeat email'))
  }

  const note = left.length
    ? `${left.join(', ')} not counted as participants`
    : 'One per email address'

  // The discount list is what tells a comp from a purchase; without it the
  // count is still the admits rule, but it is not something to assert.
  return tally.certain ? note : 'Unverified — discount codes unavailable'
}

interface CardProps {
  title: string
  value: string | number
  subtitle: string | React.ReactNode
  className?: string
}

const PerformanceCard = ({
  title,
  value,
  subtitle,
  className = '',
}: CardProps) => (
  <div
    className={`rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm sm:px-4 sm:py-3 dark:border-gray-700 dark:bg-gray-900 ${className}`}
  >
    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
      {title}
    </dt>
    <dd className="mt-1 text-lg font-semibold text-gray-900 sm:text-xl dark:text-white">
      {value}
    </dd>
    <dd className="text-xs text-gray-600 dark:text-gray-400">{subtitle}</dd>
  </div>
)

export function TicketSalesChartDisplay({
  analysis,
  paidAnalysis,
  salesConfig,
  className = '',
  includeFreeTickets = false,
  onToggleChange,
  paidCount = 0,
  freeCount = 0,
  participantTally,
  freeTicketAllocation,
  chartFallback,
}: ChartProps) {
  // `true` on the server and on the first client render, so a wide screen never
  // flashes the fallback. Phones swap to it once the effect runs.
  const isWideScreen = useMediaQuery(SM_BREAKPOINT, true)
  const tally = participantTally ?? EMPTY_TALLY
  // Chairs in the room, not sales: comps count, add-ons do not, and a repeat
  // email occupies every seat it holds. No venue size exists to divide by.
  const seats = seatsUsed(tally)
  const claimRate = freeTicketAllocation
    ? freeTicketClaimRate(freeTicketAllocation)
    : null
  const configAnnotations = salesConfig
    ? createConfigAnnotations(salesConfig)
    : []
  const chartData = adaptForChart(analysis, configAnnotations)
  const { statistics: paidStatistics, performance: paidPerformance } =
    paidAnalysis

  const statusIconType = useMemo(
    () => getStatusIcon(paidPerformance.variance),
    [paidPerformance.variance],
  )
  const statusColorClasses = useMemo(
    () => getStatusColors(paidPerformance.variance),
    [paidPerformance.variance],
  )
  // `ticketCapacity` is the SELLABLE total ("excluding sponsor/speaker
  // tickets", per its schema definition), so this figure is sales progress —
  // NOT how full the room is. 0 means no capacity was ever configured, and is
  // shown as such rather than as a percentage of an invented denominator.
  const capacityConfigured = paidAnalysis.capacity > 0
  const capacityPercentage = calculateCapacityPercentage(
    paidStatistics.totalPaidTickets,
    paidAnalysis.capacity,
  ).toFixed(1)
  const avgTicketPrice = formatCurrency(paidStatistics.averageTicketPrice)

  const chartOptions = {
    chart: {
      type: 'line' as const,
      height: '100%',
      stacked: true,
      toolbar: { show: false },
      zoom: { enabled: false },
      background: 'transparent',
      fontFamily: 'Inter, system-ui, sans-serif',
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: CHART_CONFIG.ANIMATION_SPEED,
      },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: CHART_CONFIG.COLUMN_WIDTH,
        borderRadius: CHART_CONFIG.BORDER_RADIUS,
      },
    },
    dataLabels: { enabled: false },
    stroke: {
      width: [
        ...Array(chartData.categories.length).fill(0),
        CHART_CONFIG.TARGET_LINE_WIDTH,
      ],
      curve: 'monotoneCubic' as const,
      lineCap: 'round' as const,
      dashArray: [
        ...Array(chartData.categories.length).fill(0),
        CHART_CONFIG.TARGET_DASH_ARRAY,
      ],
    },
    fill: {
      opacity: [
        ...Array(chartData.categories.length).fill(1),
        CHART_CONFIG.TARGET_OPACITY,
      ],
    },
    xaxis: {
      type: 'datetime' as const,
      labels: {
        formatter: formatDate,
        style: {
          colors: CHART_COLORS.TEXT_PRIMARY,
          fontSize: '12px',
        },
      },
      axisBorder: {
        show: true,
        color: CHART_COLORS.AXIS_BORDER,
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: CHART_COLORS.TEXT_PRIMARY,
          fontSize: '12px',
        },
        formatter: (value: number) => Math.round(value).toString(),
      },
      min: 0,
      max: chartData.maxValue,
      tickAmount: 5,
    },
    tooltip: {
      shared: true,
      intersect: false,
      theme: 'light' as const,
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
        const point = analysis.progression[dataPointIndex]
        return createTooltipContent(point, point.actualTickets, point.revenue)
      },
    },
    legend: {
      show: true,
      position: 'bottom' as const,
      horizontalAlign: 'center' as const,
      fontSize: '12px',
      fontWeight: 500,
      labels: { colors: CHART_COLORS.TEXT_PRIMARY },
    },
    grid: {
      show: true,
      borderColor: CHART_COLORS.GRID_BORDER,
      strokeDashArray: 2,
      yaxis: { lines: { show: true } },
    },
    annotations: convertAnnotationsToApexFormat(chartData.annotations),
    series: chartData.series,
  }

  if (!chartData.series.length) {
    return (
      <div className={className}>
        <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
          <div className="py-12 text-center">
            <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              No chart data available
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Unable to generate chart visualization.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Text alternative for the chart: the series carry cumulative totals, so the
  // largest value in each is its latest total. The tooltip needs a pointer and
  // is not reachable for a screen reader.
  const seriesTotal = (index: number) =>
    Math.max(0, ...chartData.series[index].data.map((point) => point.y))
  const categoryTotals = chartData.categories
    .map((category, index) => `${category}: ${seriesTotal(index)}`)
    .join(', ')
  const targetTotal = seriesTotal(chartData.series.length - 1)
  const chartSummary = `Cumulative ticket sales by type, to date: ${categoryTotals || 'none'}. Sales target for the period: ${targetTotal}. ${
    analysis.capacity > 0
      ? `Tickets for sale: ${analysis.capacity}.`
      : 'No capacity set.'
  }`

  const showChart = isWideScreen || !chartFallback

  return (
    <div className={className}>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <PerformanceCard
          title="Unique Participants"
          value={tally.certain ? tally.participants : `≈ ${tally.participants}`}
          subtitle={participantNote(tally)}
          className="lg:col-span-1"
        />

        {freeTicketAllocation && (
          <PerformanceCard
            title="Free Tickets Claimed"
            // An uncountable row makes this an unknown, never a zero: the
            // sponsor share is redemptions of 100%-off codes and the organizer
            // share is not derivable at all (see `lib/tickets/freeAllocation`).
            value={`${countLabel(freeTicketAllocation.totalClaimed)} / ${countLabel(
              freeTicketAllocation.totalAllocated,
            )}`}
            subtitle={
              claimRate === null
                ? 'Not all categories can be counted'
                : `${claimRate.toFixed(1)}% claimed`
            }
          />
        )}

        <PerformanceCard
          title="Sellable Tickets Sold"
          value={
            capacityConfigured
              ? `${paidStatistics.totalPaidTickets} / ${paidAnalysis.capacity}`
              : paidStatistics.totalPaidTickets
          }
          subtitle={
            capacityConfigured
              ? `${capacityPercentage}% of tickets for sale (comps excluded)`
              : 'No capacity set'
          }
        />

        <PerformanceCard
          title="Seats Used"
          value={tally.certain ? seats : `≈ ${seats}`}
          subtitle="Admitting tickets, comps included"
        />

        <PerformanceCard
          title="Target Progress"
          value={`${paidPerformance.currentPercentage.toFixed(1)}%`}
          subtitle={
            <span className={`flex items-center ${statusColorClasses}`}>
              {React.createElement(statusIconType, {
                className: 'mr-1 h-3 w-3 shrink-0',
              })}
              {paidPerformance.isOnTrack ? 'On Track' : 'Behind'} (
              {paidPerformance.variance > 0 ? '+' : ''}
              {paidPerformance.variance.toFixed(1)}%)
            </span>
          }
        />

        <PerformanceCard
          title="Revenue"
          value={formatCurrency(paidStatistics.totalRevenue)}
          subtitle={`${avgTicketPrice} per ticket`}
        />

        {paidPerformance.nextMilestone && (
          <PerformanceCard
            title="Next Milestone"
            value={`${paidPerformance.nextMilestone.daysAway} days`}
            subtitle={paidPerformance.nextMilestone.label}
          />
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 sm:h-10 sm:w-10 dark:bg-blue-900/20">
              <ChartBarIcon className="h-4 w-4 text-blue-600 sm:h-5 sm:w-5 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 sm:text-lg dark:text-white">
                Ticket Sales by Category
              </h3>
              <p className="text-xs text-gray-600 sm:text-sm dark:text-gray-400">
                Track sales progress by ticket type with target milestones
              </p>
            </div>
          </div>

          {/* The toggle only changes the chart series, so it is dead UI on the
              widths where the chart is replaced by the table. */}
          {onToggleChange && showChart && (
            <TicketVisibilityToggle
              includeFreeTickets={includeFreeTickets}
              onToggle={onToggleChange}
              paidCount={paidCount}
              freeCount={freeCount}
            />
          )}
        </div>

        <p className="sr-only">{chartSummary}</p>

        {showChart ? (
          <div
            className="chart-container chart-height-300 sm:chart-height-400 lg:chart-height-450 relative w-full"
            suppressHydrationWarning
            aria-hidden="true"
          >
            <Chart
              options={chartOptions}
              series={chartData.series}
              type="line"
              height="100%"
              width="100%"
            />
          </div>
        ) : (
          <div>
            <p className="mb-3 text-xs text-gray-600 dark:text-gray-400">
              Paid tickets by type. The sales chart is shown on wider screens.
            </p>
            {chartFallback}
          </div>
        )}
      </div>
    </div>
  )
}
