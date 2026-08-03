'use client'

import React, { useMemo } from 'react'
import { ConferenceSchedule } from '@/lib/conference/types'
import { formatConferenceDate } from '@/lib/time'
import {
  PlusIcon,
  BookmarkIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'

const HEADER_CLASS =
  'border-b border-gray-200 bg-white px-4 shrink-0 dark:border-gray-700 dark:bg-gray-900 min-h-[64px] flex items-center'

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
  hasUnsavedChanges,
  isDraftMode,
  onToggleDraftMode,
  onPromote,
}: {
  schedule: ConferenceSchedule | null
  schedules: ConferenceSchedule[]
  currentDayIndex: number
  onDayChange: (index: number) => void
  onAddTrack: () => void
  onSave: () => void
  isSaving: boolean
  saveSuccess: boolean
  hasUnsavedChanges: boolean
  isDraftMode: boolean
  onToggleDraftMode: (enabled: boolean) => void
  onPromote: () => void
}) => {
  const dayNavigation = useMemo(() => {
    if (!schedules || schedules.length <= 1) return null

    return (
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
          {schedules.map((daySchedule, index) => {
            const isActive = index === currentDayIndex
            const dayLabel = `Day ${index + 1}`
            // Format the YYYY-MM-DD date via the shared, timezone-safe helper —
            // a raw `new Date(date)` here is parsed as UTC midnight and can show
            // the previous day in western timezones (see AGENTS.md).
            const dateLabel = formatConferenceDate(daySchedule.date, {
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
      <div className="flex w-full flex-wrap items-center justify-between gap-4 py-2">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          {dayNavigation}
          {schedule && (
            <span
              title={`This day's schedule is currently ${schedule.status === 'official' ? 'live and visible to the public' : 'a private draft'}.`}
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                schedule.status === 'official'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
              }`}
            >
              {schedule.status === 'official' ? 'Official' : 'Draft'}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 border-r border-gray-300 pr-3 dark:border-gray-700">
            <span
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
              title="When viewing Draft, you can make changes safely. When viewing Live, you see exactly what attendees see."
            >
              Viewing:{' '}
              <strong
                className={
                  isDraftMode
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-green-600 dark:text-green-400'
                }
              >
                {isDraftMode ? 'Draft (Editable)' : 'Live (Read-only)'}
              </strong>
            </span>
            <button
              title="Toggle View: Switch between your private Draft and the Live public schedule."
              onClick={() => onToggleDraftMode(!isDraftMode)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:outline-none ${
                isDraftMode ? 'bg-amber-500' : 'bg-green-500'
              }`}
              role="switch"
              aria-checked={isDraftMode}
            >
              <span className="sr-only">Toggle View Mode</span>
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isDraftMode ? 'translate-x-0' : 'translate-x-5'
                }`}
              />
            </button>
          </div>

          <button
            onClick={onAddTrack}
            className={SECONDARY_BUTTON}
            type="button"
            disabled={!isDraftMode}
          >
            <PlusIcon className="h-4 w-4" />
            Track
          </button>

          {isDraftMode && (
            <button
              title={
                hasUnsavedChanges
                  ? 'Save your changes first before publishing.'
                  : "Publish: Make this day's schedule official and visible to the public."
              }
              onClick={onPromote}
              disabled={isSaving || !schedule?._id || hasUnsavedChanges}
              className={`${SECONDARY_BUTTON} ${hasUnsavedChanges ? 'cursor-not-allowed opacity-50' : ''}`}
              type="button"
            >
              <CheckCircleIcon
                className={`h-4 w-4 ${hasUnsavedChanges ? 'text-gray-400' : 'text-green-600'}`}
              />
              Publish
            </button>
          )}
          {/* Live view: not merely a `hidden` utility class (which a competing
              display utility can win against) — the Save button does not exist
              there, because the official schedule has no save path. */}
          {isDraftMode && (
            <button
              onClick={onSave}
              disabled={isSaving}
              aria-label={
                !saveSuccess && !isSaving && hasUnsavedChanges
                  ? 'Save — you have unsaved changes'
                  : undefined
              }
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
                  {/* Unsaved-changes dot: any dirty day, not just the visible one. */}
                  {hasUnsavedChanges && !isSaving && (
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 rounded-full bg-amber-300"
                    />
                  )}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export const HeaderSection = React.memo(HeaderSectionComponent)
HeaderSection.displayName = 'HeaderSection'
