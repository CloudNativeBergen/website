import { ReactNode } from 'react'
import clsx from 'clsx'

export type StatColor =
  | 'blue'
  | 'green'
  | 'purple'
  | 'slate'
  | 'indigo'
  | 'yellow'
  | 'red'

export interface StatCardProps {
  /** The main value to display */
  value: string | number
  /** Label describing the stat */
  label: string
  /** Optional subtitle or additional context */
  subtitle?: string | ReactNode
  /** Color theme for the value */
  color?: StatColor
  /** Optional className for the container */
  className?: string
}

const valueColorClasses: Record<StatColor, string> = {
  blue: 'text-brand-cloud-blue dark:text-blue-300',
  green: 'text-brand-fresh-green dark:text-green-300',
  purple: 'text-brand-nordic-purple dark:text-indigo-300',
  indigo: 'text-brand-cloud-blue dark:text-indigo-300',
  yellow: 'text-yellow-600 dark:text-yellow-300',
  red: 'text-red-600 dark:text-red-300',
  slate: 'text-gray-900 dark:text-white',
}

export function StatCard({
  value,
  label,
  subtitle,
  color = 'slate',
  className,
}: StatCardProps) {
  return (
    <div
      className={clsx(
        'rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900',
        className,
      )}
    >
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd
        className={clsx('mt-1 text-xl font-semibold', valueColorClasses[color])}
      >
        {value}
      </dd>
      {subtitle && (
        <dd className="text-xs text-gray-600 dark:text-gray-400">{subtitle}</dd>
      )}
    </div>
  )
}
