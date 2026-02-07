import React from 'react'
import Link from 'next/link'
import { ChevronLeftIcon } from '@heroicons/react/24/outline'
import { AdminHeaderActions, type ActionItem } from './AdminHeaderActions'

export interface StatCardProps {
  value: string | number

  label: string

  subtitle?: string | React.ReactNode

  color?: 'blue' | 'green' | 'purple' | 'slate' | 'indigo' | 'yellow' | 'red'
}

export interface AdminPageHeaderProps {
  icon: React.ReactNode

  title: string

  description: string | React.ReactNode

  contextHighlight?: string

  stats?: StatCardProps[]

  /** Structured action items — preferred way to add header actions */
  actionItems?: ActionItem[]

  /** Raw JSX actions — escape hatch for complex cases */
  actions?: React.ReactNode

  children?: React.ReactNode

  backLink?: {
    href: string
    label?: string
  }
}

function getValueColorClasses(color: StatCardProps['color'] = 'slate') {
  switch (color) {
    case 'blue':
      return 'text-brand-cloud-blue dark:text-blue-300'
    case 'green':
      return 'text-brand-fresh-green dark:text-green-300'
    case 'purple':
      return 'text-brand-nordic-purple dark:text-indigo-300'
    case 'indigo':
      return 'text-brand-cloud-blue dark:text-indigo-300'
    case 'yellow':
      return 'text-yellow-600 dark:text-yellow-300'
    case 'red':
      return 'text-red-600 dark:text-red-300'
    case 'slate':
    default:
      return 'text-gray-900 dark:text-white'
  }
}

function StatCard({ value, label, subtitle, color = 'slate' }: StatCardProps) {
  const valueColorClasses = getValueColorClasses(color)

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className={`mt-1 text-xl font-semibold ${valueColorClasses}`}>
        {value}
      </dd>
      {subtitle && (
        <dd className="text-xs text-gray-600 dark:text-gray-400">{subtitle}</dd>
      )}
    </div>
  )
}

export function AdminPageHeader({
  icon,
  title,
  description,
  contextHighlight,
  stats,
  actionItems,
  actions,
  children,
  backLink,
}: AdminPageHeaderProps) {
  const getGridCols = (statCount: number) => {
    if (statCount <= 1) return 'grid-cols-1'
    if (statCount <= 2) return 'grid-cols-2'
    if (statCount <= 3) return 'grid-cols-2 sm:grid-cols-3'
    if (statCount <= 4) return 'grid-cols-2 md:grid-cols-4'
    if (statCount <= 5) return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'
    if (statCount <= 6) return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-6'

    return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'
  }

  return (
    <div className="pb-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {backLink && (
            <Link
              href={backLink.href}
              className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              title={backLink.label || 'Back'}
            >
              <ChevronLeftIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            </Link>
          )}
          <div className="shrink-0">
            <div className="h-6 w-6 text-brand-cloud-blue sm:h-8 sm:w-8 dark:text-blue-300">
              {icon}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="font-space-grotesk text-xl leading-6 font-bold text-brand-slate-gray sm:text-2xl sm:leading-7 sm:tracking-tight lg:text-3xl lg:leading-8 dark:text-white">
              {title}
            </h1>
            <div className="font-inter mt-1 text-sm text-brand-slate-gray/70 dark:text-gray-400">
              {typeof description === 'string' ? (
                <p>
                  {description}
                  {contextHighlight && (
                    <>
                      {' '}
                      <span className="font-medium text-brand-cloud-blue dark:text-blue-300">
                        {contextHighlight}
                      </span>
                    </>
                  )}
                </p>
              ) : (
                description
              )}
            </div>
          </div>
        </div>

        {(actionItems || actions) && (
          <div className="shrink-0">
            {actionItems ? (
              <AdminHeaderActions items={actionItems} />
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">{actions}</div>
            )}
          </div>
        )}
      </div>

      {stats && stats.length > 0 && (
        <div
          className={`font-inter mt-4 grid sm:mt-6 ${getGridCols(stats.length)} gap-3`}
        >
          {stats.map((stat, index) => (
            <StatCard
              key={`${stat.label}-${index}`}
              value={stat.value}
              label={stat.label}
              subtitle={stat.subtitle}
              color={stat.color}
            />
          ))}
        </div>
      )}

      {children}
    </div>
  )
}
