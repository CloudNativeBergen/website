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
  claimedCoverageNote,
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
import { calculateCapacityPercentage, isOnTrack } from '@/lib/tickets/utils'
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
   * Whether the provider's amounts INCLUDE VAT, so the Revenue card can say
   * which it is. Derived from the adapter (`amountsIncludeVat`), never
   * hardcoded: Checkin reports ex VAT and Tito tax-inclusive, so the same card
   * means different things for two tenants. `undefined` = unknown provider
   * (storybook/fallback), and then the card says nothing rather than guessing.
   */
  amountsIncludeVat?: boolean
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

// Colour and icon state the same verdict the words do, so they read off the
// same rule. Anything inside the tolerance is on track and must not be dressed
// as a failure; only a conference past it gets the red downward arrow.
const getStatusColors = (variance: number): string => {
  if (variance >= PERFORMANCE_THRESHOLDS.EXCELLENT) {
    return 'text-green-600 dark:text-green-400'
  }
  if (isOnTrack(variance)) {
    return 'text-yellow-600 dark:text-yellow-400'
  }
  return 'text-red-600 dark:text-red-400'
}

const getStatusIcon = (variance: number) => {
  if (variance >= PERFORMANCE_THRESHOLDS.EXCELLENT) {
    return ArrowTrendingUpIcon
  }
  if (isOnTrack(variance)) {
    return ExclamationTriangleIcon
  }
  return ArrowTrendingDownIcon
}

const EMPTY_TALLY: ParticipantTally = {
  participants: 0,
  addOnsWithSeat: 0,
  addOnsWithoutSeat: 0,
  repeatTickets: 0,
  roleBasis: 'declared',
}

/** Nothing was assumed only when every type's role was DECLARED by a human. */
const isCertain = (tally: ParticipantTally) => tally.roleBasis === 'declared'

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

  // What the count rests on is `admits`, declared per ticket type. Where no type
  // is declared it defaults to "this type seats someone", and that assumption is
  // named rather than asserted — the discount list cannot move this number.
  //
  // `proposed` is the weaker claim of the two, not the stronger one: a role was
  // PROPOSED from the evidence and is NOT applied, so the number is still the
  // default and the copy says which guess it is running on.
  if (tally.roleBasis === 'declared') return note
  return tally.roleBasis === 'proposed'
    ? 'Some ticket type roles are suggested — confirm them on Ticket Types'
    : 'Ticket types with no role count as seats — set roles on Ticket Types'
}

/**
 * Columns at `xl` for the number of stat cards actually rendered. Two of the
 * cards are conditional, so a fixed six-column grid orphaned Revenue on a row
 * of its own the moment the free-ticket card appeared. Seven cards break 4 + 3
 * rather than 6 + 1 — six across is already the tightest the numbers stay
 * scannable at. Tailwind needs the class written out, hence the map.
 */
const XL_COLUMNS: Record<number, string> = {
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
  7: 'xl:grid-cols-4',
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
  amountsIncludeVat,
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
  const vatBasis =
    amountsIncludeVat === undefined
      ? ''
      : amountsIncludeVat
        ? ' · incl. VAT'
        : ' · ex. VAT'

  // The chart follows the toggle; the cards above never do — they are the paid
  // population by definition (sellable-ticket progress, revenue, average
  // price). So the chart says which population it is drawing instead of letting
  // the two halves of one screen silently describe different things.
  const soldLabel = includeFreeTickets ? 'All tickets' : 'Paid tickets'
  const chartScope = includeFreeTickets
    ? 'All tickets, paid and free. The cards above count paid tickets only.'
    : 'Paid tickets only, like the cards above.'

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
        // ApexCharts hands back an index into ITS series, which need not have a
        // matching progression point (an empty progression still renders the
        // target series). Dereferencing `undefined` threw inside the formatter.
        const point = analysis.progression[dataPointIndex]
        if (!point) return ''
        return createTooltipContent(
          point,
          point.actualTickets,
          point.revenue,
          soldLabel,
        )
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

  // `chartData.series` is NEVER empty — `adaptForChart` always appends the
  // target series — so the old `!chartData.series.length` guard could not fire,
  // and an analysis with nothing in it drew an empty chart whose screen-reader
  // summary asserted "Sales target for the period: 0". The progression is what
  // there is, or is not, something to draw.
  const hasProgression = analysis.progression.length > 0

  // Text alternative for the chart: the series carry cumulative totals, so the
  // largest value in each is its latest total. The tooltip needs a pointer and
  // is not reachable for a screen reader.
  const seriesTotal = (index: number) =>
    Math.max(0, ...chartData.series[index].data.map((point) => point.y))
  const categoryTotals = chartData.categories
    .map((category, index) => `${category}: ${seriesTotal(index)}`)
    .join(', ')
  const targetTotal = seriesTotal(chartData.series.length - 1)
  const chartSummary = hasProgression
    ? `${chartScope} Cumulative ticket sales by type, to date: ${categoryTotals || 'none'}. Sales target for the period: ${targetTotal}. ${
        analysis.capacity > 0
          ? `Tickets for sale: ${analysis.capacity}.`
          : 'No capacity set.'
      }`
    : 'No sales progression to chart. No sales target is shown.'

  const showChart = (isWideScreen || !chartFallback) && hasProgression

  // The five that always render (Participants, Sellable, Seats, Target,
  // Revenue) plus the two conditional ones. Kept beside the grid class it
  // feeds, because a count that drifts from the cards re-creates the orphan.
  const cardCount =
    5 + (freeTicketAllocation ? 1 : 0) + (paidPerformance.nextMilestone ? 1 : 0)

  return (
    <div className={className}>
      <div
        className={`mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 ${XL_COLUMNS[cardCount]}`}
      >
        <PerformanceCard
          title="Unique Participants"
          value={
            isCertain(tally) ? tally.participants : `≈ ${tally.participants}`
          }
          subtitle={participantNote(tally)}
        />

        {freeTicketAllocation && (
          <PerformanceCard
            title="Free Tickets Claimed"
            // Over the categories that CAN be counted, named in the subtitle —
            // the organizer share is not derivable at all, so an event-wide
            // figure here would be permanently unknown (see
            // `lib/tickets/freeAllocation`). An uncountable row is still never
            // drawn as a zero.
            value={`${countLabel(freeTicketAllocation.totalClaimed)} / ${countLabel(
              freeTicketAllocation.claimedAllocated,
            )}`}
            subtitle={
              freeTicketAllocation.totalClaimed === 'unknown'
                ? 'No category can be counted'
                : [
                    claimRate === null
                      ? 'Claimed'
                      : `${claimRate.toFixed(1)}% claimed`,
                    claimedCoverageNote(freeTicketAllocation),
                  ]
                    .filter(Boolean)
                    .join(' · ')
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
          value={isCertain(tally) ? seats : `≈ ${seats}`}
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
              {/* Read off the SAME number the arrow, the colour and the
                  percentage beside it are read off. The stored
                  `performance.isOnTrack` is computed separately, and a card
                  that renders one and colours by the other showed "On Track"
                  next to a red −4.2%. */}
              {isOnTrack(paidPerformance.variance) ? 'On Track' : 'Behind'} (
              {paidPerformance.variance > 0 ? '+' : ''}
              {paidPerformance.variance.toFixed(1)}%)
            </span>
          }
        />

        <PerformanceCard
          title="Revenue"
          value={formatCurrency(paidStatistics.totalRevenue)}
          subtitle={`${avgTicketPrice} per ticket${vatBasis}`}
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
              {/* Which population the chart draws. The toggle below changes
                  the chart only, so without this line switching it silently
                  made the chart and the cards above describe different sets of
                  tickets. */}
              <p className="text-xs text-gray-600 sm:text-sm dark:text-gray-400">
                {chartScope}
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
        ) : hasProgression ? (
          <div>
            <p className="mb-3 text-xs text-gray-600 dark:text-gray-400">
              Paid tickets by type. The sales chart is shown on wider screens.
            </p>
            {chartFallback}
          </div>
        ) : (
          <div className="py-12 text-center">
            <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
              No chart data available
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              There is no sales progression to chart yet, so no target is drawn.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
