import React from 'react'
import {
  CalendarDaysIcon,
  Squares2X2Icon,
  ListBulletIcon,
  BookmarkIcon,
} from '@heroicons/react/24/outline'
import { ProgramViewMode, ViewModeConfig } from '@/hooks/useProgramViewMode'
import clsx from 'clsx'

interface ViewModeSelectorProps {
  viewMode: ProgramViewMode
  viewModes: ViewModeConfig[]
  onViewModeChange: (mode: ProgramViewMode) => void
  currentViewConfig: ViewModeConfig
}

const getViewModeIcon = (iconName: string) => {
  switch (iconName) {
    case 'calendar':
      return CalendarDaysIcon
    case 'grid':
      return Squares2X2Icon
    case 'list':
      return ListBulletIcon
    case 'bookmark':
      return BookmarkIcon
    default:
      return CalendarDaysIcon
  }
}

export function ViewModeSelector({
  viewMode,
  viewModes,
  onViewModeChange,
}: ViewModeSelectorProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-brand-frosted-steel bg-white p-1">
      {viewModes.map((mode) => {
        const Icon = getViewModeIcon(mode.icon)
        const isActive = viewMode === mode.id

        return (
          <button
            key={mode.id}
            onClick={() => onViewModeChange(mode.id)}
            title={`${mode.label}: ${mode.description}`}
            className={clsx(
              'flex items-center gap-1 rounded-md px-3 py-2 text-xs font-medium transition-all duration-200',
              'hover:shadow-sm focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-1 focus:outline-none',
              isActive
                ? 'bg-brand-cloud-blue text-white shadow-sm'
                : 'text-brand-slate-gray hover:bg-brand-sky-mist hover:text-brand-cloud-blue',
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{mode.label}</span>
          </button>
        )
      })}
    </div>
  )
}
