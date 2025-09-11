'use client'

import { useMemo, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { EventTicket, EventOrderUser } from '@/lib/tickets/types'
import {
  generateSalesChartData,
  calculateSalesSummary,
  type SalesChartConfig,
} from '@/lib/tickets/sales-chart'
import { formatCurrency } from '@/lib/format'

// Hook to detect dark mode
function useDarkMode() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'))
    }

    // Check initial state
    checkDarkMode()

    // Watch for changes
    const observer = new MutationObserver(checkDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [])

  return isDark
}

// Dynamically import ApexCharts to avoid SSR issues
const Chart = dynamic(() => import('react-apexcharts'), {
  ssr: false,
  loading: () => <div className="h-96 animate-pulse rounded bg-gray-200" />,
})

interface SalesChartProps {
  tickets: EventTicket[] | EventOrderUser[]
  config: SalesChartConfig
  className?: string
}

interface StatCardProps {
  title: string
  value: string
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
}

function StatCard({
  title,
  value,
  subtitle,
  trend = 'neutral',
}: StatCardProps) {
  const trendColors = {
    up: 'text-green-600 dark:text-green-400',
    down: 'text-red-600 dark:text-red-400',
    neutral: 'text-gray-600 dark:text-gray-400',
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {title}
      </h3>
      <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">
        {value}
      </p>
      {subtitle && (
        <p className={`mt-1 text-sm ${trendColors[trend]}`}>{subtitle}</p>
      )}
    </div>
  )
}

export function TicketSalesChart({
  tickets,
  config,
  className = '',
}: SalesChartProps) {
  const [includeFreeTickets, setIncludeFreeTickets] = useState(false)
  const isDarkMode = useDarkMode()

  const chartData = useMemo(() => {
    return generateSalesChartData(tickets, config, includeFreeTickets)
  }, [tickets, config, includeFreeTickets])

  const salesSummary = useMemo(() => {
    return calculateSalesSummary(chartData, config.capacity)
  }, [chartData, config.capacity])

  const revenue = useMemo(() => {
    // Check if we have EventOrderUser[] or EventTicket[]
    const isEventOrderUser = tickets.length > 0 && 'orderId' in tickets[0]

    let result = 0

    if (isEventOrderUser) {
      const eventOrderUsers = tickets as EventOrderUser[]

      if (includeFreeTickets) {
        // Include all tickets and sum all prices (including free ones which are 0)
        result = eventOrderUsers.reduce((sum, ticket) => {
          // Safely handle missing price array
          if (!ticket.price || !Array.isArray(ticket.price)) {
            return sum
          }
          return (
            sum +
            ticket.price.reduce((priceSum, p) => priceSum + Number(p.price), 0)
          )
        }, 0)
      } else {
        // Include tickets from orders that have at least one paid component,
        // but only sum the paid portions
        result = eventOrderUsers.reduce((sum, ticket) => {
          // Safely handle missing price array
          if (!ticket.price || !Array.isArray(ticket.price)) {
            // If we can't get price data but the ticket is marked as paid,
            // we can't calculate revenue accurately, so skip it
            return sum
          }

          const ticketTotal = ticket.price.reduce(
            (priceSum, p) => priceSum + Number(p.price),
            0,
          )
          const hasPaidComponent = ticket.price.some((p) => Number(p.price) > 0)

          if (ticket.isPaid && hasPaidComponent) {
            return sum + ticketTotal
          }
          return sum
        }, 0)
      }
    } else {
      const eventTickets = tickets as EventTicket[]
      const filteredTickets = includeFreeTickets
        ? eventTickets
        : eventTickets.filter((ticket) => parseFloat(ticket.sum || '0') >= 1)

      result = filteredTickets.reduce(
        (sum, ticket) => sum + parseFloat(ticket.sum || '0'),
        0,
      )
    }

    console.log('💰 Revenue calculation:', {
      ticketCount: tickets.length,
      isEventOrderUser,
      includeFreeTickets,
      hasPriceData:
        tickets.length > 0 && isEventOrderUser
          ? !!(tickets[0] as EventOrderUser).price
          : 'N/A',
      revenue: result,
    })

    return result
  }, [tickets, includeFreeTickets])

  const chartOptions = useMemo(() => {
    const darkModeColors = {
      textColor: isDarkMode ? '#D1D5DB' : '#6B7280',
      gridColor: isDarkMode ? '#374151' : '#E5E7EB',
      axisColor: isDarkMode ? '#4B5563' : '#E5E7EB',
    }

    // Calculate stroke configuration based on actual series count
    const seriesCount = chartData.series.length
    const strokeWidths = Array(seriesCount).fill(0)
    const dashArrays = Array(seriesCount).fill(0)
    const fillOpacities = Array(seriesCount).fill(1)

    // Last series is the target line - configure it properly
    if (seriesCount > 0) {
      strokeWidths[seriesCount - 1] = 4 // Target line stroke width for visibility
      dashArrays[seriesCount - 1] = 8 // Dash pattern (8px dash, 8px gap)
      fillOpacities[seriesCount - 1] = 0 // Target line no fill
    }

    // Configure stacking - columns stack together, line series separate
    const stackingGroups = Array(seriesCount).fill('tickets')
    // Last series (target line) gets its own group so it doesn't stack
    if (seriesCount > 0) {
      stackingGroups[seriesCount - 1] = 'target'
    }

    return {
      chart: {
        type: 'bar' as const, // Base chart type for mixed charts
        height: 400,
        stacked: true, // Enable stacking for columns
        toolbar: { show: false },
        zoom: { enabled: false },
        background: 'transparent',
      },
      plotOptions: {
        bar: {
          columnWidth: '60%',
          borderRadius: 3,
        },
      },
      stroke: {
        width: strokeWidths,
        curve: 'smooth' as const,
        dashArray: dashArrays,
        lineCap: 'round' as const,
      },
      fill: {
        opacity: fillOpacities,
        type: Array(seriesCount)
          .fill('solid')
          .map((_, index) => (index === seriesCount - 1 ? 'solid' : 'solid')),
      },
      dataLabels: {
        enabled: false,
      },
      markers: {
        size: Array(seriesCount)
          .fill(0)
          .map(
            (_, index) => (index === seriesCount - 1 ? 4 : 0), // Small markers for target line visibility
          ),
        strokeWidth: Array(seriesCount)
          .fill(0)
          .map((_, index) => (index === seriesCount - 1 ? 1 : 0)),
        colors: Array(seriesCount)
          .fill('#FFFFFF')
          .map((_, index) =>
            index === seriesCount - 1 ? '#EA580C' : '#FFFFFF',
          ),
      },
      legend: {
        position: 'bottom' as const,
        horizontalAlign: 'center' as const,
        labels: {
          colors: darkModeColors.textColor,
        },
      },
      xaxis: {
        type: 'category' as const,
        labels: {
          style: {
            fontSize: '12px',
            colors: darkModeColors.textColor,
          },
        },
        axisBorder: {
          color: darkModeColors.axisColor,
        },
        axisTicks: {
          color: darkModeColors.axisColor,
        },
      },
      yaxis: {
        title: {
          text: 'Number of Tickets',
          style: {
            color: darkModeColors.textColor,
          },
        },
        labels: {
          style: {
            colors: darkModeColors.textColor,
          },
        },
        min: 0,
        max: config.capacity, // Set Y-axis to target capacity
      },
      grid: {
        borderColor: darkModeColors.gridColor,
        strokeDashArray: 3,
      },
      theme: {
        mode: isDarkMode ? ('dark' as const) : ('light' as const),
      },
      tooltip: {
        shared: true,
        intersect: false,
        style: {
          fontSize: '14px',
        },
        x: {
          show: true,
          format: 'dd MMM yyyy',
          formatter: (value: number) => {
            const date = new Date(value)
            return `Week of ${date.toLocaleDateString('en-US', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}`
          },
        },
        y: {
          formatter: (
            value: number,
            { seriesIndex }: { seriesIndex: number },
          ) => {
            const isTargetLine = seriesIndex === chartData.series.length - 1
            if (isTargetLine) {
              return `Target: ${value.toLocaleString()} tickets`
            }
            return `${value.toLocaleString()} tickets`
          },
          title: {
            formatter: (
              seriesName: string,
              { seriesIndex }: { seriesIndex: number },
            ) => {
              const isTargetLine = seriesIndex === chartData.series.length - 1
              if (isTargetLine) {
                return ''
              }
              return `${seriesName}:`
            },
          },
        },
        custom: ({
          series,
          seriesIndex,
          dataPointIndex,
          w,
        }: {
          series: number[][]
          seriesIndex: number
          dataPointIndex: number
          w: { globals: { categoryLabels?: string[]; seriesNames: string[] } }
        }) => {
          const isTargetLine = seriesIndex === chartData.series.length - 1
          const categories = w.globals.categoryLabels || chartData.categories
          const weekLabel = categories[dataPointIndex]

          // Define the same colors used in the chart
          const CATEGORY_COLORS = [
            '#3B82F6', // blue-500
            '#10B981', // emerald-500
            '#F59E0B', // amber-500
            '#EF4444', // red-500
            '#8B5CF6', // violet-500
            '#06B6D4', // cyan-500
          ]

          // Fix undefined week label by formatting properly
          const formattedWeekLabel = weekLabel || `Week ${dataPointIndex + 1}`

          if (isTargetLine) {
            const targetValue = series[seriesIndex]?.[dataPointIndex] ?? 0
            return `
              <div style="background: ${isDarkMode ? '#1f2937' : '#ffffff'}; border: 1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}; border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); min-width: 200px;">
                <div style="font-weight: 600; margin-bottom: 8px; color: ${isDarkMode ? '#e5e7eb' : '#374151'}; font-size: 14px;">Week of ${formattedWeekLabel}</div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 12px; height: 12px; background: #EA580C; border-radius: 50%;"></div>
                  <span style="color: #EA580C; font-weight: 600; font-size: 14px;">Sales Target: ${targetValue.toLocaleString()} tickets</span>
                </div>
              </div>
            `
          }

          // For ticket categories, show breakdown with colors
          let total = 0
          let breakdown = ''

          for (let i = 0; i < series.length - 1; i++) {
            // Exclude target line
            const value = series[i][dataPointIndex]
            if (value > 0) {
              total += value
              const seriesName = w.globals.seriesNames[i]
              const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length]
              breakdown += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin: 6px 0; padding: 4px 0;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 12px; height: 12px; background: ${color}; border-radius: 2px;"></div>
                    <span style="color: ${isDarkMode ? '#d1d5db' : '#4b5563'}; font-size: 13px;">${seriesName}</span>
                  </div>
                  <span style="font-weight: 600; color: ${isDarkMode ? '#e5e7eb' : '#374151'}; font-size: 13px;">${value.toLocaleString()}</span>
                </div>
              `
            }
          }

          return `
            <div style="background: ${isDarkMode ? '#1f2937' : '#ffffff'}; border: 1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}; border-radius: 8px; padding: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); min-width: 220px;">
              <div style="font-weight: 600; margin-bottom: 12px; color: ${isDarkMode ? '#e5e7eb' : '#374151'}; font-size: 14px;">Week of ${formattedWeekLabel}</div>

              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; margin-bottom: 8px; border-bottom: 1px solid ${isDarkMode ? '#374151' : '#e5e7eb'};">
                <span style="font-weight: 600; color: ${isDarkMode ? '#e5e7eb' : '#374151'}; font-size: 14px;">Total Tickets</span>
                <span style="font-weight: 700; font-size: 16px; color: ${isDarkMode ? '#10b981' : '#059669'};">${total.toLocaleString()}</span>
              </div>

              <div style="margin-top: 8px;">
                ${breakdown}
              </div>
            </div>
          `
        },
      },
    }
  }, [
    isDarkMode,
    config.capacity,
    chartData.series.length,
    chartData.categories,
  ])

  return (
    <div className={className}>
      {/* Statistics Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Current Sales"
          value={`${salesSummary.totalSold} / ${config.capacity}`}
          subtitle={`${salesSummary.percentageOfCapacity.toFixed(1)}% of capacity`}
        />
        <StatCard
          title="Target Progress"
          value={`${salesSummary.percentageOfCapacity.toFixed(1)}%`}
          subtitle={salesSummary.isOnTrack ? 'On Track' : 'Behind Target'}
          trend={salesSummary.isOnTrack ? 'up' : 'down'}
        />
        <StatCard
          title="Revenue"
          value={formatCurrency(revenue)}
          subtitle={`${formatCurrency(revenue / Math.max(salesSummary.totalSold, 1))} per ticket`}
        />
        <StatCard
          title="Categories"
          value={chartData.categories.length.toString()}
          subtitle={`${chartData.categories.join(', ')}`}
        />
      </div>

      {/* Chart Container */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Ticket Sales by Category
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Track sales progress by ticket type with target milestones
            </p>
          </div>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={includeFreeTickets}
              onChange={(e) => setIncludeFreeTickets(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Include free tickets
            </span>
          </label>
        </div>

        <div className="h-96">
          <Chart
            key={`chart-${includeFreeTickets}`} // Force re-render on toggle
            options={chartOptions}
            series={chartData.series}
            type="bar"
            height="100%"
            width="100%"
          />
        </div>
      </div>
    </div>
  )
}
