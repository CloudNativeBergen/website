'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import type {
  TicketTargetAnalysis,
  ConferenceWithTargets,
  TargetVsActualData,
} from '@/lib/tickets/targets'
import { processChartData } from '@/lib/tickets/chart-data'
import { formatCurrency } from '@/lib/format'
import {
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

// Constants for better maintainability
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
  TARGET_DASH_ARRAY: 10, // Increased dash pattern for clear target line indication
  TARGET_OPACITY: 0.6, // Slightly increased opacity for better visibility
  COLUMN_WIDTH: '65%',
  BORDER_RADIUS: 3,
} as const

// Dynamically import ApexCharts to avoid SSR issues
const Chart = dynamic(() => import('react-apexcharts'), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
    </div>
  ),
})

interface TicketTargetChartProps {
  analysis: TicketTargetAnalysis
  conference?: ConferenceWithTargets // Add conference prop for program date annotation
  className?: string
}

/**
 * Formats a date string for display in chart labels
 * @param dateStr - ISO date string
 * @returns Formatted date string (e.g., "Sep 4")
 */
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Gets the appropriate status color classes based on performance variance
 * @param variance - Performance variance percentage
 * @returns Tailwind color classes
 */
const getStatusColorClasses = (variance: number): string => {
  if (variance >= PERFORMANCE_THRESHOLDS.EXCELLENT) {
    return 'text-green-600 dark:text-green-400'
  }
  if (variance >= PERFORMANCE_THRESHOLDS.GOOD) {
    return 'text-yellow-600 dark:text-yellow-400'
  }
  return 'text-red-600 dark:text-red-400'
}

/**
 * Gets the appropriate status icon component based on performance variance
 * @param variance - Performance variance percentage
 * @returns React component for the status icon
 */
const getStatusIcon = (variance: number) => {
  if (variance >= PERFORMANCE_THRESHOLDS.EXCELLENT) {
    return ArrowTrendingUpIcon
  }
  if (variance >= PERFORMANCE_THRESHOLDS.GOOD) {
    return ExclamationTriangleIcon
  }
  return ArrowTrendingDownIcon
}

/**
 * Performance statistics card component
 * @param title - Card title
 * @param value - Main value to display
 * @param subtitle - Subtitle content (string or JSX)
 * @param className - Additional CSS classes
 */
interface PerformanceCardProps {
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
}: PerformanceCardProps) => (
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

/**
 * Generates custom tooltip HTML for chart data points
 * @param point - Chart data point
 * @param today - Current date
 * @returns HTML string for tooltip
 */
function generateTooltipHTML(point: TargetVsActualData, today: Date): string {
  if (!point) return ''

  const date = new Date(point.date)
  const isToday = date.toDateString() === today.toDateString()
  const isFuture = date > today
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const badges: string[] = []
  if (isToday) {
    badges.push(
      '<span class="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Today</span>',
    )
  }
  if (isFuture) {
    badges.push(
      '<span class="ml-2 text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">Future</span>',
    )
  }
  if (point.isMilestone) {
    badges.push(
      `<span class="ml-2 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full">${point.milestoneLabel || 'Milestone'}</span>`,
    )
  }

  const categoryHTML = Object.entries(point.categories)
    .filter(([, count]) => (count as number) > 0)
    .map(
      ([category, count]) =>
        `<div class="flex justify-between items-center py-1">
        <span class="text-sm text-gray-600 dark:text-gray-400">${category}:</span>
        <span class="font-medium text-gray-900 dark:text-white">${count}</span>
      </div>`,
    )
    .join('')

  const avgPriceHTML =
    point.actualPaid > 0
      ? `<div class="flex justify-between items-center">
        <span class="text-sm text-gray-600 dark:text-gray-400">Avg. Price:</span>
        <span class="text-sm text-gray-700 dark:text-gray-300">${formatCurrency(point.revenue / point.actualPaid)}</span>
      </div>`
      : ''

  return `
    <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 min-w-[280px]">
      <div class="font-semibold text-gray-900 dark:text-white mb-3 text-center">
        ${formattedDate}
        ${badges.join('')}
      </div>
      ${categoryHTML ? `<div class="mb-3">${categoryHTML}</div>` : ''}
      <div class="border-t border-gray-200 dark:border-gray-600 pt-3 mt-3 space-y-2">
        <div class="flex justify-between items-center">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Total Sold:</span>
          <span class="font-semibold text-gray-900 dark:text-white">${point.actual}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-sm text-gray-600 dark:text-gray-400">Target:</span>
          <span class="font-medium ${point.actual >= point.target ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">${point.target}</span>
        </div>
        <div class="flex justify-between items-center">
          <span class="text-sm text-gray-600 dark:text-gray-400">Revenue:</span>
          <span class="font-medium text-green-600 dark:text-green-400">${formatCurrency(point.revenue)}</span>
        </div>
        ${avgPriceHTML}
      </div>
    </div>
  `
}

/**
 * Enhanced ticket target chart component with category breakdowns and improved visualization
 * Optimized for production use with performance improvements and error handling
 */
export function TicketTargetChartEnhanced({
  analysis,
  conference,
  className = '',
}: TicketTargetChartProps) {
  const chartData = useMemo(() => {
    try {
      return processChartData(analysis)
    } catch (error) {
      console.error('Error processing chart data:', error)
      return {
        series: [],
        combinedData: [],
        debugInfo: {
          totalCategories: 0,
          categoriesList: [],
          dataPointsCount: 0,
          maxActualValue: 0,
          maxTargetValue: 0,
        },
      }
    }
  }, [analysis])

  const chartOptions = useMemo(() => {
    const { series, combinedData, debugInfo } = chartData
    const today = new Date()

    if (!combinedData.length) {
      return null
    }

    // Use consistent capacity for Y-axis max to prevent chart scaling changes
    const maxTarget = analysis.capacity

    return {
      chart: {
        type: 'line' as const,
        height: '100%',
        stacked: true,
        toolbar: { show: false },
        zoom: { enabled: false },
        selection: { enabled: false },
        pan: { enabled: false },
        background: 'transparent',
        fontFamily: 'Inter, system-ui, sans-serif',
        redrawOnParentResize: true, // Force redraw when container resizes
        redrawOnWindowResize: true, // Force redraw on window resize
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: CHART_CONFIG.ANIMATION_SPEED,
          animateGradually: {
            enabled: true,
            delay: 50,
          },
        },
        sparkline: {
          enabled: false,
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
        width: Array(debugInfo.totalCategories)
          .fill(0)
          .concat([CHART_CONFIG.TARGET_LINE_WIDTH]),
        curve: 'monotoneCubic' as const, // Changed to monotoneCubic for better smooth interpolation
        lineCap: 'round' as const,
        dashArray: Array(debugInfo.totalCategories)
          .fill(0)
          .concat([CHART_CONFIG.TARGET_DASH_ARRAY]),
      },
      fill: {
        opacity: Array(debugInfo.totalCategories)
          .fill(1)
          .concat([CHART_CONFIG.TARGET_OPACITY]),
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
        axisTicks: {
          show: true,
          color: CHART_COLORS.AXIS_BORDER,
        },
        tooltip: { enabled: false },
      },
      yaxis: {
        title: {
          style: {
            color: CHART_COLORS.TEXT_PRIMARY,
            fontSize: '12px',
            fontWeight: 500,
          },
        },
        labels: {
          style: {
            colors: CHART_COLORS.TEXT_PRIMARY,
            fontSize: '12px',
          },
          formatter: (value: number) => Math.round(value).toString(),
        },
        min: 0, // Ensure Y-axis starts at 0
        max: maxTarget, // Set max to target for even grid lines and optimal space usage
        tickAmount: 5, // Limit to 5 horizontal grid lines for cleaner look
        axisBorder: {
          show: true,
          color: CHART_COLORS.AXIS_BORDER,
        },
        axisTicks: {
          show: true,
          color: CHART_COLORS.AXIS_BORDER,
        },
      },
      tooltip: {
        shared: true,
        intersect: false,
        theme: 'light',
        style: {
          fontSize: '12px',
          fontFamily: 'Inter, system-ui, sans-serif',
        },
        custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
          const point = chartData.combinedData[dataPointIndex]
          return generateTooltipHTML(point, today)
        },
      },
      legend: {
        show: true,
        position: 'bottom' as const,
        horizontalAlign: 'center' as const,
        fontSize: '12px',
        fontWeight: 500,
        labels: { colors: CHART_COLORS.TEXT_PRIMARY },
        markers: {
          size: 12,
          strokeWidth: 0,
          shape: 'square' as const,
        },
        itemMargin: {
          horizontal: 10,
          vertical: 6,
        },
        showForSingleSeries: false,
        showForNullSeries: false,
        formatter: (seriesName: string) => seriesName,
      },
      grid: {
        show: true,
        borderColor: CHART_COLORS.GRID_BORDER,
        strokeDashArray: 2,
        position: 'back' as const,
        xaxis: { lines: { show: false } },
        yaxis: { lines: { show: true } },
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      annotations: {
        xaxis: [
          {
            x: today.getTime(),
            borderColor: CHART_COLORS.TODAY_MARKER,
            borderWidth: 1,
            strokeDashArray: 3,
            label: {
              style: {
                color: CHART_COLORS.TODAY_MARKER,
                background: CHART_COLORS.TODAY_BACKGROUND,
                fontSize: '10px',
                borderRadius: 3,
              },
              text: 'Today',
              position: 'top',
              offsetY: -5,
            },
          },
          // Program announcement date annotation
          ...(conference?.program_date
            ? [
                {
                  x: new Date(conference.program_date).getTime(),
                  borderColor: '#8B5CF6', // violet-500 - distinctive color for program announcement
                  borderWidth: 1,
                  strokeDashArray: 5,
                  label: {
                    style: {
                      color: '#8B5CF6',
                      background: '#F3E8FF', // violet-50 background
                      fontSize: '10px',
                      borderRadius: 3,
                    },
                    text: 'Program',
                    position: 'top',
                    offsetY: -5,
                  },
                },
              ]
            : []),
        ],
      },
      series,
    }
  }, [chartData, conference?.program_date, analysis.capacity])

  // Memoized performance calculations
  const performanceData = useMemo(() => {
    const { performance, currentSales, capacity } = analysis
    const StatusIcon = getStatusIcon(performance.variance)

    return {
      statusColorClasses: getStatusColorClasses(performance.variance),
      StatusIcon,
      capacityPercentage: (
        (currentSales.totalTickets / capacity) *
        100
      ).toFixed(1),
      avgTicketPrice:
        currentSales.paidTickets > 0
          ? formatCurrency(currentSales.revenue / currentSales.paidTickets)
          : formatCurrency(0),
    }
  }, [analysis])

  // Early return if no chart data
  if (!chartData.series.length || !chartOptions) {
    return (
      <div className={`${className}`}>
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
      {/* Compact Performance Overview */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <PerformanceCard
          title="Current Sales"
          value={`${analysis.currentSales.totalTickets} / ${analysis.capacity}`}
          subtitle={`${performanceData.capacityPercentage}% of capacity`}
        />

        <PerformanceCard
          title="Target Progress"
          value={`${analysis.performance.actualPercentage.toFixed(1)}%`}
          subtitle={
            <span
              className={`flex items-center ${performanceData.statusColorClasses}`}
            >
              <performanceData.StatusIcon className="mr-1 h-3 w-3 flex-shrink-0" />
              {analysis.performance.isOnTrack ? 'On Track' : 'Behind'} (
              {analysis.performance.variance > 0 ? '+' : ''}
              {analysis.performance.variance.toFixed(1)}%)
            </span>
          }
        />

        <PerformanceCard
          title="Revenue"
          value={formatCurrency(analysis.currentSales.revenue)}
          subtitle={`${performanceData.avgTicketPrice} per ticket`}
        />

        <PerformanceCard
          title="Next Milestone"
          value={
            analysis.performance.nextMilestone
              ? `${analysis.performance.daysToNextMilestone} days`
              : 'None'
          }
          subtitle={
            analysis.performance.nextMilestone?.label ||
            'No upcoming milestones'
          }
        />
      </div>

      {/* Chart Container */}
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
