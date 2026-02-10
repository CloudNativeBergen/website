'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  ClipboardDocumentCheckIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  GlobeAltIcon,
  CalendarIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'
import { fetchQuickActions } from '@/app/(admin)/admin/actions'
import { type QuickAction } from '@/lib/dashboard/data-types'
import { getCurrentPhase } from '@/lib/conference/phase'
import { BaseWidgetProps } from '@/lib/dashboard/types'
import { useWidgetData } from '@/hooks/dashboard/useWidgetData'
import { WidgetSkeleton, WidgetEmptyState, WidgetErrorState } from './shared'

const iconMap = {
  ClipboardDocumentCheckIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  GlobeAltIcon,
  CalendarIcon,
  Cog6ToothIcon,
}

const variantStyles = {
  primary:
    'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600',
  secondary:
    'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600',
  success:
    'bg-green-600 text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600',
  warning:
    'bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600',
}

type QuickActionsWidgetProps = BaseWidgetProps

export function QuickActionsWidget({ conference }: QuickActionsWidgetProps) {
  const currentPhase = useMemo(
    () => (conference ? getCurrentPhase(conference) : 'planning'),
    [conference],
  )

  const {
    data: actions,
    loading,
    error,
    refetch,
  } = useWidgetData<QuickAction[]>(
    conference ? () => fetchQuickActions(conference, currentPhase) : null,
    [conference, currentPhase],
  )

  if (loading) return <WidgetSkeleton />
  if (error) return <WidgetErrorState onRetry={refetch} />
  if (!actions || actions.length === 0) {
    return <WidgetEmptyState message="No quick actions available" />
  }

  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 text-xs font-semibold text-gray-900 dark:text-gray-100">
        Quick Actions
      </h3>
      {/* Compact 3-column grid to show all 6 actions */}
      <div className="grid flex-1 auto-rows-fr grid-cols-3 gap-1.5 @[300px]:gap-2">
        {actions.map((action) => {
          const IconComponent =
            iconMap[action.icon as keyof typeof iconMap] || CalendarIcon
          const variantClass =
            variantStyles[action.variant] || variantStyles.secondary

          return (
            <Link
              key={action.label}
              href={action.link}
              className={`group relative flex flex-col items-center justify-center gap-1 rounded-lg p-2 transition-all @[300px]:gap-1.5 @[300px]:p-2.5 ${variantClass}`}
            >
              {action.badge !== undefined && action.badge > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-gray-900 @[300px]:top-1.5 @[300px]:right-1.5">
                  {action.badge > 99 ? '99+' : action.badge}
                </span>
              )}
              {/* Responsive icon sizing */}
              <IconComponent className="h-5 w-5 shrink-0 @[250px]:h-6 @[250px]:w-6 @[400px]:h-7 @[400px]:w-7" />
              {/* Use short labels for compact display */}
              <span className="text-center text-[10px] leading-tight font-medium @[300px]:text-[11px]">
                {action.shortLabel || action.label}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
