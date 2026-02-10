'use client'

import dynamic from 'next/dynamic'
import { useMemo, useSyncExternalStore } from 'react'
import type { ApexOptions } from 'apexcharts'
import { CheckCircleIcon, TicketIcon } from '@heroicons/react/24/outline'
import {
  getRadialBarChartOptions,
  getLineChartOptions,
  getThemeColors,
} from '@/lib/dashboard/chart-theme'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'
import { fetchTicketSales } from '@/app/(admin)/admin/actions'
import { TicketSalesData } from '@/lib/dashboard/data-types'
import { useWidgetData } from '@/hooks/dashboard/useWidgetData'
import {
  WidgetSkeleton,
  WidgetEmptyState,
  WidgetHeader,
  PhaseBadge,
  ProgressBar,
} from './shared'

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false })

function subscribeDarkMode(callback: () => void) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', callback)
  return () => mediaQuery.removeEventListener('change', callback)
}

function getSnapshotDarkMode() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

type TicketSalesDashboardWidgetProps = BaseWidgetProps

export function TicketSalesDashboardWidget({
  conference,
}: TicketSalesDashboardWidgetProps) {
  const { data, loading } = useWidgetData<TicketSalesData>(
    conference ? () => fetchTicketSales(conference) : null,
    [conference],
  )

  const isDark = useSyncExternalStore(
    subscribeDarkMode,
    getSnapshotDarkMode,
    () => false,
  )
  const phase = conference ? getCurrentPhase(conference) : null

  const gaugeOptions: ApexOptions = useMemo(() => {
    const themeColors = getThemeColors(isDark)
    return {
      ...getRadialBarChartOptions(isDark),
      colors: [themeColors.success],
      labels: ['Capacity'],
    }
  }, [isDark])

  const gaugeSeries = useMemo(() => (data ? [data.percentage] : [0]), [data])

  const trendOptions: ApexOptions = useMemo(() => {
    const themeColors = getThemeColors(isDark)
    const baseOptions = getLineChartOptions(isDark)
    return {
      ...baseOptions,
      xaxis: {
        ...baseOptions.xaxis,
        categories:
          data?.salesByDate.map((d) =>
            new Date(d.date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            }),
          ) || [],
      },
      colors: [themeColors.primary, themeColors.gray[300]],
      stroke: {
        ...baseOptions.stroke,
        dashArray: [0, 5],
      },
      legend: {
        ...baseOptions.legend,
        show: true,
      },
      tooltip: {
        ...baseOptions.tooltip,
        shared: true,
      },
    }
  }, [data?.salesByDate, isDark])

  const trendSeries = useMemo(
    () => [
      {
        name: 'Actual Sales',
        data: data?.salesByDate.map((d) => d.sales) || [],
      },
      {
        name: 'Target',
        data: data?.salesByDate.map((d) => d.target) || [],
      },
    ],
    [data?.salesByDate],
  )

  if (loading) {
    return <WidgetSkeleton />
  }

  // Initialization phase: Setup guide
  if (phase === 'initialization') {
    return (
      <div className="flex h-full flex-col">
        <WidgetHeader
          title="Ticket Sales"
          badge={<PhaseBadge label="Setup" variant="blue" />}
        />
        <div className="flex min-h-0 flex-1 flex-col justify-center space-y-3 overflow-y-auto text-sm text-gray-600 dark:text-gray-400">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-xs font-medium text-blue-900 dark:text-blue-300">
              Configure ticket sales system:
            </p>
            <ul className="mt-2 space-y-1 text-xs text-blue-800 dark:text-blue-400">
              <li>• Set ticket capacity and pricing tiers</li>
              <li>• Configure early bird and discount codes</li>
              <li>• Integrate payment gateway</li>
              <li>• Set up sales targets and milestones</li>
            </ul>
          </div>
          <a
            href="/admin/tickets"
            className="block rounded-lg bg-blue-600 px-4 py-2 text-center text-xs font-medium text-white transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Configure Tickets
          </a>
        </div>
      </div>
    )
  }

  // Post-conference phase: Final revenue report
  if (phase === 'post-conference') {
    if (!data || data.capacity === 0) {
      return <WidgetEmptyState message="No ticket sales data available" />
    }

    return (
      <div className="flex h-full flex-col">
        <WidgetHeader
          title="Ticket Sales"
          badge={<PhaseBadge label="Complete" variant="green" />}
        />
        <div className="flex min-h-0 flex-1 flex-col justify-center space-y-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                Tickets Sold
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {data.currentSales}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {data.percentage.toFixed(1)}% capacity
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="text-[10px] font-medium text-gray-500 uppercase dark:text-gray-400">
                Total Revenue
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                ${(data.revenue / 1000).toFixed(0)}k
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
            <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            <p className="text-xs text-green-800 dark:text-green-300">
              Conference completed - view full sales analytics
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Planning & Execution phases: Not configured
  if (!data) {
    return (
      <div className="flex h-full flex-col">
        <WidgetHeader
          title="Ticket Sales"
          badge={<PhaseBadge label="Not Configured" variant="amber" />}
        />
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg bg-gray-50 p-6 text-center dark:bg-gray-800">
          <div className="space-y-2">
            <TicketIcon className="mx-auto h-8 w-8 text-gray-400 dark:text-gray-500" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Ticket integration not configured
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Set up Check-in customer &amp; event IDs in conference settings to
              enable ticket tracking.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Awaiting first sale
  if (data.currentSales === 0) {
    return (
      <div className="flex h-full flex-col">
        <WidgetHeader
          title="Ticket Sales"
          link={{ href: '/admin/tickets', label: 'Manage tickets →' }}
        />
        <div className="flex min-h-0 flex-1 flex-col justify-between overflow-y-auto">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
              <div className="text-[11px] text-blue-600 dark:text-blue-400">
                Capacity
              </div>
              <div className="mt-1 text-2xl font-bold text-blue-900 dark:text-blue-100">
                {data.capacity}
              </div>
            </div>
            <div className="rounded-lg bg-purple-50 p-3 dark:bg-purple-900/20">
              <div className="text-[11px] text-purple-600 dark:text-purple-400">
                Days Until Event
              </div>
              <div className="mt-1 text-2xl font-bold text-purple-900 dark:text-purple-100">
                {data.daysUntilEvent}
              </div>
            </div>
            <div className="rounded-lg bg-green-50 p-3 dark:bg-green-900/20">
              <div className="text-[11px] text-green-600 dark:text-green-400">
                Tickets Sold
              </div>
              <div className="mt-1 text-2xl font-bold text-green-900 dark:text-green-100">
                0
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
              Sales Targets
            </h4>
            {data.milestones.map((milestone) => {
              const percent =
                data.capacity > 0
                  ? Math.round((data.currentSales / milestone.target) * 100)
                  : 0
              return (
                <div key={milestone.name}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      {milestone.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {data.currentSales} / {milestone.target}
                    </span>
                  </div>
                  <ProgressBar
                    value={percent}
                    color={
                      milestone.reached
                        ? 'bg-green-500 dark:bg-green-400'
                        : 'bg-blue-500 dark:bg-blue-400'
                    }
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <WidgetHeader
        title="Ticket Sales"
        link={{ href: '/admin/tickets', label: 'Manage tickets →' }}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mb-3 grid shrink-0 grid-cols-3 gap-2 @[200px]:grid-cols-1 @[400px]:grid-cols-3">
          <div className="rounded-lg bg-blue-50 p-2.5 dark:bg-blue-900/20">
            <div className="text-[11px] text-blue-600 dark:text-blue-400">
              Sold
            </div>
            <div className="mt-0.5 text-lg font-bold text-blue-900 dark:text-blue-100">
              {data.currentSales}
            </div>
            <div className="mt-0.5 text-[11px] text-blue-600 dark:text-blue-400">
              of {data.capacity}
            </div>
          </div>
          <div className="rounded-lg bg-green-50 p-2.5 dark:bg-green-900/20">
            <div className="text-[11px] text-green-600 dark:text-green-400">
              Revenue
            </div>
            <div className="mt-0.5 text-lg font-bold text-green-900 dark:text-green-100">
              ${(data.revenue / 1000).toFixed(0)}k
            </div>
          </div>
          <div className="rounded-lg bg-purple-50 p-2.5 dark:bg-purple-900/20">
            <div className="text-[11px] text-purple-600 dark:text-purple-400">
              Velocity
            </div>
            <div className="mt-0.5 text-lg font-bold text-purple-900 dark:text-purple-100">
              {data.salesVelocity.toFixed(1)}/d
            </div>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-3 @[200px]:grid-cols-1 @[500px]:grid-cols-2">
          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
              Capacity
            </h4>
            <div className="h-32 @[400px]:h-36">
              <Chart
                options={gaugeOptions}
                series={gaugeSeries}
                type="radialBar"
                height="100%"
              />
            </div>
          </div>

          <div className="hidden @[400px]:block">
            <h4 className="mb-1.5 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
              Milestones
            </h4>
            <div className="space-y-1.5">
              {data.milestones.map((milestone) => (
                <div
                  key={milestone.name}
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-2 dark:bg-gray-800"
                >
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${milestone.reached
                          ? 'bg-green-500 dark:bg-green-400'
                          : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                    />
                    <span className="truncate text-[11px] leading-tight font-medium text-gray-700 dark:text-gray-200">
                      {milestone.name}
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    {milestone.target}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 shrink-0">
          <h4 className="mb-1.5 text-[11px] font-semibold text-gray-700 dark:text-gray-200">
            Sales vs Target
          </h4>
          <div className="h-24 @[400px]:h-28">
            <Chart
              options={trendOptions}
              series={trendSeries}
              type="line"
              height="100%"
            />
          </div>
        </div>

        <div className="mt-3 shrink-0 rounded-lg bg-blue-50 p-2.5 text-center dark:bg-blue-900/20">
          <div className="text-[11px] text-blue-600 dark:text-blue-400">
            Days Until Event
          </div>
          <div className="mt-0.5 text-2xl font-bold text-blue-900 dark:text-blue-100">
            {data.daysUntilEvent}
          </div>
        </div>
      </div>
    </div>
  )
}
