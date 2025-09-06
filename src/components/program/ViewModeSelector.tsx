import React, { useCallback, useMemo } from 'react'
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

// Constants for better performance
const VIEW_MODE_ICONS = {
  calendar: CalendarDaysIcon,
  grid: Squares2X2Icon,
  list: ListBulletIcon,
  bookmark: BookmarkIcon,
} as const

const SHORT_LABELS = {
  'Schedule View': 'Schedule',
  'Card Grid': 'Card',
  'List View': 'List',
  'Personal Agenda': 'Personal',
} as const

const BUTTON_BASE_CLASSES =
  'flex min-w-[2.5rem] items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition-all duration-200 sm:min-w-[unset] sm:justify-start sm:px-3 hover:shadow-sm focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-1 focus:outline-none'
const ACTIVE_CLASSES = 'bg-brand-cloud-blue text-white shadow-sm'
const INACTIVE_CLASSES =
  'text-brand-slate-gray hover:bg-brand-sky-mist hover:text-brand-cloud-blue dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-blue-400'

const getViewModeIcon = (iconName: string) => {
  return (
    VIEW_MODE_ICONS[iconName as keyof typeof VIEW_MODE_ICONS] ||
    CalendarDaysIcon
  )
}

const getShortLabel = (label: string) => {
  return SHORT_LABELS[label as keyof typeof SHORT_LABELS] || label
}

export const ViewModeSelector = React.memo(function ViewModeSelector({
  viewMode,
  viewModes,
  onViewModeChange,
}: ViewModeSelectorProps) {
  // Memoized view mode data to prevent recalculations
  const viewModeData = useMemo(
    () =>
      viewModes.map((mode) => ({
        ...mode,
        Icon: getViewModeIcon(mode.icon),
        shortLabel: getShortLabel(mode.label),
        isActive: viewMode === mode.id,
      })),
    [viewModes, viewMode],
  )

  // Memoized click handlers to prevent recreation
  const handleModeChange = useCallback(
    (modeId: ProgramViewMode) => {
      onViewModeChange(modeId)
    },
    [onViewModeChange],
  )

  return (
    <div className="flex items-center gap-1 rounded-lg border border-brand-frosted-steel bg-white p-1 dark:border-gray-600 dark:bg-gray-800">
      {viewModeData.map((mode) => (
        <button
          key={mode.id}
          onClick={() => handleModeChange(mode.id)}
          title={`${mode.label}: ${mode.description}`}
          className={clsx(
            BUTTON_BASE_CLASSES,
            mode.isActive ? ACTIVE_CLASSES : INACTIVE_CLASSES,
          )}
        >
          <mode.Icon className="h-4 w-4" />
          {/* Show short labels on medium screens, full labels on large screens */}
          <span className="hidden sm:inline lg:hidden">{mode.shortLabel}</span>
          <span className="hidden lg:inline">{mode.label}</span>
        </button>
      ))}
    </div>
  )
})
