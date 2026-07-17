'use client'

import React, { useMemo } from 'react'
import { ConferenceSchedule } from '@/lib/conference/types'
import {
  PlusIcon,
  BookmarkIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'

const HEADER_CLASS =
  'border-b border-gray-200 bg-white px-4 py-2 shrink-0 dark:border-gray-700 dark:bg-gray-900'

const PRIMARY_BUTTON =
  'inline-flex items-center gap-2 rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600'

const SECONDARY_BUTTON =
  'inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'

const HeaderSectionComponent = ({
  schedule,
  schedules,
  currentDayIndex,
  onDayChange,
  onAddTrack,
  onSave,
  isSaving,
  saveSuccess,
}: {
  schedule: ConferenceSchedule | null
  schedules: ConferenceSchedule[]
  currentDayIndex: number
  onDayChange: (index: number) => void
  onAddTrack: () => void
  onSave: () => void
  isSaving: boolean
  saveSuccess: boolean
}) => {
  const trackCount = useMemo(
    () => schedule?.tracks?.length || 0,
    [schedule?.tracks?.length],
  )

  const headerInfo = useMemo(() => {
    if (!schedule) return null
    return `${schedule.date} • ${trackCount} tracks`
  }, [schedule, trackCount])

  const dayNavigation = useMemo(() => {
    if (!schedules || schedules.length <= 1) return null

    return (
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
          {schedules.map((daySchedule, index) => {
            const isActive = index === currentDayIndex
            const dayDate = new Date(daySchedule.date)
            const dayLabel = `Day ${index + 1}`
            const dateLabel = dayDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })

            return (
              <button
                key={`day-${index}-${daySchedule.date}`}
                onClick={() => onDayChange(index)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                  isActive
                    ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/50 dark:text-blue-300'
                    : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100'
                }`}
                type="button"
              >
                <div className="flex flex-col items-center">
                  <span className="text-xs font-semibold">{dayLabel}</span>
                  <span className="text-xs">{dateLabel}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }, [schedules, currentDayIndex, onDayChange])

  return (
    <div className={HEADER_CLASS}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Schedule Editor
            </h1>
            {headerInfo && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {headerInfo}
              </p>
            )}
          </div>
          {dayNavigation}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onAddTrack}
            className={SECONDARY_BUTTON}
            type="button"
          >
            <PlusIcon className="h-4 w-4" />
            Track
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className={`${PRIMARY_BUTTON} transition-all duration-300 ${
              saveSuccess
                ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                : ''
            }`}
            type="button"
          >
            {saveSuccess ? (
              <>
                <CheckCircleIcon className="h-4 w-4 animate-pulse" />
                Saved!
              </>
            ) : (
              <>
                <BookmarkIcon className="h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export const HeaderSection = React.memo(HeaderSectionComponent)
HeaderSection.displayName = 'HeaderSection'
