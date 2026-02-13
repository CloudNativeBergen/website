import { ReactNode } from 'react'
import clsx from 'clsx'

export type MetricTrend = 'up' | 'down' | 'neutral'

export interface MetricCardProps {
  /** Label/title for the metric */
  title: string
  /** The main value to display */
  value: string | number
  /** Optional subtitle or additional context */
  subtitle?: string | ReactNode
  /** Icon component to display */
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>
  /** Trend indicator affects icon background color */
  trend?: MetricTrend
  /** Show loading skeleton instead of value */
  isLoading?: boolean
  /** Optional className for the container */
  className?: string
}

const trendBgClasses: Record<MetricTrend, string> = {
  up: 'bg-green-100 dark:bg-green-900/20',
  down: 'bg-red-100 dark:bg-red-900/20',
  neutral: 'bg-gray-100 dark:bg-gray-700',
}

const trendIconClasses: Record<MetricTrend, string> = {
  up: 'text-green-600 dark:text-green-400',
  down: 'text-red-600 dark:text-red-400',
  neutral: 'text-gray-600 dark:text-gray-400',
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend = 'neutral',
  isLoading = false,
  className,
}: MetricCardProps) {
  return (
    <div
      className={clsx(
        'rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {title}
          </p>
          {isLoading ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          ) : (
            <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
              {value}
            </p>
          )}
          {subtitle && !isLoading && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          )}
        </div>
        {Icon && (
          <div
            className={clsx('shrink-0 rounded-full p-3', trendBgClasses[trend])}
          >
            <Icon className={clsx('h-6 w-6', trendIconClasses[trend])} />
          </div>
        )}
      </div>
    </div>
  )
}
