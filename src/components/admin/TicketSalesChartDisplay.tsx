'use client'

import dynamic from 'next/dynamic'
import type {
  TicketAnalysisResult,
  SalesTargetConfig,
} from '@/lib/tickets/types'
import type { FreeTicketAllocation } from '@/lib/tickets/utils'
import {
  adaptForChart,
  createTooltipContent,
  createConfigAnnotations,
  convertAnnotationsToApexFormat,
} from '@/lib/tickets/chart-adapter'
import {
  calculateFreeTicketClaimRate,
  calculateCapacityPercentage,
} from '@/lib/tickets/utils'
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
  salesConfig?: SalesTargetConfig
  className?: string

  includeFreeTickets?: boolean
  onToggleChange?: (include: boolean) => void
  paidCount?: number
  freeCount?: number
  freeTicketAllocation?: FreeTicketAllocation
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

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
    className={`rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900 ${className}`}
  >
    <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
      {title}
    </dt>
    <dd className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
      {value}
    </dd>
    <dd className="text-xs text-gray-600 dark:text-gray-400">{subtitle}</dd>
  </div>
)

export function TicketSalesChartDisplay({
  analysis,
  salesConfig,
  className = '',
  includeFreeTickets = false,
  onToggleChange,
  paidCount = 0,
  freeCount = 0,
  freeTicketAllocation,
}: ChartProps) {
  const configAnnotations = salesConfig
    ? createConfigAnnotations(salesConfig)
    : []
  const chartData = adaptForChart(analysis, configAnnotations)
  const { statistics, performance } = analysis

  const StatusIcon = getStatusIcon(performance.variance)
  const statusColorClasses = getStatusColors(performance.variance)
  const capacityPercentage = calculateCapacityPercentage(
    statistics.totalPaidTickets,
    analysis.capacity,
  ).toFixed(1)
  const avgTicketPrice = formatCurrency(statistics.averageTicketPrice)

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
      theme: 'light',
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

  return (
    <div className={className}>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {freeTicketAllocation && (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Free Tickets Claimed
            </dt>
            <dd className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
              {freeTicketAllocation.totalClaimed} /{' '}
              {freeTicketAllocation.totalAllocated}
            </dd>
            <dd className="text-xs text-gray-600 dark:text-gray-400">
              {calculateFreeTicketClaimRate(
                freeTicketAllocation.totalClaimed,
                freeTicketAllocation.totalAllocated,
              ).toFixed(1)}
              % claimed
            </dd>
          </div>
        )}

        <PerformanceCard
          title="Current Sales"
          value={`${statistics.totalPaidTickets} / ${analysis.capacity}`}
          subtitle={`${capacityPercentage}% of capacity`}
        />

        <PerformanceCard
          title="Target Progress"
          value={`${performance.currentPercentage.toFixed(1)}%`}
          subtitle={
            <span className={`flex items-center ${statusColorClasses}`}>
              <StatusIcon className="mr-1 h-3 w-3 flex-shrink-0" />
              {performance.isOnTrack ? 'On Track' : 'Behind'} (
              {performance.variance > 0 ? '+' : ''}
              {performance.variance.toFixed(1)}%)
            </span>
          }
        />

        <PerformanceCard
          title="Revenue"
          value={formatCurrency(statistics.totalRevenue)}
          subtitle={`${avgTicketPrice} per ticket`}
        />

        <PerformanceCard
          title="Next Milestone"
          value={
            performance.nextMilestone
              ? `${performance.nextMilestone.daysAway} days`
              : 'None'
          }
          subtitle={
            performance.nextMilestone?.label || 'No upcoming milestones'
          }
        />
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

          {onToggleChange && (
            <TicketVisibilityToggle
              includeFreeTickets={includeFreeTickets}
              onToggle={onToggleChange}
              paidCount={paidCount}
              freeCount={freeCount}
            />
          )}
        </div>

        <div
          className="chart-container chart-height-300 sm:chart-height-400 lg:chart-height-450 relative w-full"
          suppressHydrationWarning
        >
          <Chart
            options={chartOptions}
            series={chartData.series}
            type="line"
            height="100%"
            width="100%"
          />
        </div>
      </div>
    </div>
  )
}
