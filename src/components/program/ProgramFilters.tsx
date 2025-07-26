import React, { useState, useCallback, useMemo } from 'react'
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  CalendarDaysIcon,
  MapIcon,
  AcademicCapIcon,
  UserGroupIcon,
  TagIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline'
import { ProgramFilterOptions } from '@/hooks/useProgramFilter'
import { ProgramViewMode, ViewModeConfig } from '@/hooks/useProgramViewMode'
import { Format, Level, Audience } from '@/lib/proposal/types'
import { Topic } from '@/lib/topic/types'
import { getFormatConfig } from '@/lib/proposal/ui/config'
import {
  getLevelConfig,
  getAudienceBadgeConfig,
} from '@/lib/proposal/ui/badges'
import { ViewModeSelector } from './ViewModeSelector'

interface ProgramFiltersProps {
  filters: ProgramFilterOptions
  availableFilters: {
    days: string[]
    tracks: string[]
    formats: Format[]
    levels: Level[]
    audiences: Audience[]
    topics: Topic[]
  }
  onFilterChange: <K extends keyof ProgramFilterOptions>(
    key: K,
    value: ProgramFilterOptions[K],
  ) => void
  onClearFilters: () => void
  hasActiveFilters: boolean
  totalTalks: number
  filteredTalks: number
  // View mode props
  viewMode: ProgramViewMode
  viewModes: ViewModeConfig[]
  onViewModeChange: (mode: ProgramViewMode) => void
  currentViewConfig: ViewModeConfig
}

// Constants for better performance
const DEFAULT_SELECT_CLASSES =
  'col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-brand-cloud-blue @sm:text-sm/6'
const CHEVRON_DOWN_CLASSES =
  'pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 @sm:size-4'

const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export const ProgramFilters = React.memo(function ProgramFilters({
  filters,
  availableFilters,
  onFilterChange,
  onClearFilters,
  hasActiveFilters,
  totalTalks,
  filteredTalks,
  viewMode,
  viewModes,
  onViewModeChange,
  currentViewConfig,
}: ProgramFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Memoized handlers for better performance
  const handleToggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFilterChange('searchQuery', e.target.value)
    },
    [onFilterChange],
  )

  const handleDayChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onFilterChange('selectedDay', e.target.value)
    },
    [onFilterChange],
  )

  const handleTrackChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onFilterChange('selectedTrack', e.target.value)
    },
    [onFilterChange],
  )

  const handleFormatChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onFilterChange('selectedFormat', e.target.value as Format | '')
    },
    [onFilterChange],
  )

  const handleLevelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onFilterChange('selectedLevel', e.target.value as Level | '')
    },
    [onFilterChange],
  )

  const handleAudienceChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onFilterChange('selectedAudience', e.target.value as Audience | '')
    },
    [onFilterChange],
  )

  const handleTopicChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onFilterChange('selectedTopic', e.target.value)
    },
    [onFilterChange],
  )

  // Memoized format options for better performance
  const formatOptions = useMemo(
    () =>
      availableFilters.formats.map((format) => {
        const config = getFormatConfig(format)
        return { value: format, label: `${config.label} (${config.duration})` }
      }),
    [availableFilters.formats],
  )

  const levelOptions = useMemo(
    () =>
      availableFilters.levels.map((level) => {
        const config = getLevelConfig(level)
        return { value: level, label: config?.label || level }
      }),
    [availableFilters.levels],
  )

  const audienceOptions = useMemo(
    () =>
      availableFilters.audiences.map((audience) => {
        const config = getAudienceBadgeConfig(audience)
        return { value: audience, label: config.text }
      }),
    [availableFilters.audiences],
  )

  const formattedDays = useMemo(
    () =>
      availableFilters.days.map((day) => ({
        value: day,
        label: formatDate(day),
      })),
    [availableFilters.days],
  )

  return (
    <div className="@container space-y-4 rounded-lg border border-brand-frosted-steel bg-brand-glacier-white p-4">
      {/* Compact Header with View Mode Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-brand-cloud-blue" />
            <h3 className="font-space-grotesk text-base font-semibold text-brand-slate-gray">
              Filters
            </h3>
          </div>
          {/* Hide count on mobile and tablet (@lg:block) to reduce clutter */}
          <div className="hidden rounded-md bg-brand-sky-mist px-2 py-1 @lg:block">
            <p className="font-inter text-xs text-brand-slate-gray">
              <span className="font-semibold text-brand-cloud-blue">
                {filteredTalks}
              </span>{' '}
              / {totalTalks}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View Mode Selector */}
          <ViewModeSelector
            viewMode={viewMode}
            viewModes={viewModes}
            onViewModeChange={onViewModeChange}
            currentViewConfig={currentViewConfig}
          />

          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={onClearFilters}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-cloud-blue transition-colors hover:bg-brand-sky-mist"
              >
                <XMarkIcon className="h-3 w-3" />
                <span className="hidden @sm:inline">Clear</span>
              </button>
            )}
            <button
              onClick={handleToggleExpanded}
              className="flex min-w-[60px] items-center justify-center gap-1 rounded-md px-2 py-1 text-xs text-brand-slate-gray transition-colors hover:bg-brand-sky-mist @sm:min-w-[unset]"
            >
              {isExpanded ? (
                <>
                  <ChevronUpIcon className="h-3 w-3" />
                  <span className="hidden w-8 text-left @sm:inline">Less</span>
                </>
              ) : (
                <>
                  <ChevronDownIcon className="h-3 w-3" />
                  <span className="hidden w-8 text-left @sm:inline">More</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Always Visible: Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search talks, speakers, topics..."
          value={filters.searchQuery}
          onChange={handleSearchChange}
          className="block w-full rounded-md bg-white py-1.5 pr-3 pl-10 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-brand-cloud-blue @sm:text-sm/6"
        />
      </div>

      {/* Expandable Filters */}
      {isExpanded && (
        <div className="space-y-4 border-t border-brand-frosted-steel pt-4">
          {/* Show talk count on mobile and tablet when expanded */}
          <div className="@lg:hidden">
            <p className="font-inter text-center text-xs text-brand-slate-gray">
              Showing{' '}
              <span className="font-semibold text-brand-cloud-blue">
                {filteredTalks}
              </span>{' '}
              of {totalTalks} talks
            </p>
          </div>

          {/* Container-responsive layout: adapts to filter container width */}
          <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @lg:grid-cols-4">
            {/* Day Filter */}
            {availableFilters.days.length > 1 && (
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-brand-slate-gray">
                  <CalendarDaysIcon className="h-3 w-3" />
                  Day
                </label>
                <div className="mt-2 grid grid-cols-1">
                  <select
                    value={filters.selectedDay}
                    onChange={handleDayChange}
                    className={DEFAULT_SELECT_CLASSES}
                  >
                    <option value="">All days</option>
                    {formattedDays.map((day) => (
                      <option key={day.value} value={day.value}>
                        {day.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={CHEVRON_DOWN_CLASSES}
                  />
                </div>
              </div>
            )}

            {/* Track Filter */}
            {availableFilters.tracks.length > 1 && (
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-brand-slate-gray">
                  <MapIcon className="h-3 w-3" />
                  Track
                </label>
                <div className="mt-2 grid grid-cols-1">
                  <select
                    value={filters.selectedTrack}
                    onChange={handleTrackChange}
                    className={DEFAULT_SELECT_CLASSES}
                  >
                    <option value="">All tracks</option>
                    {availableFilters.tracks.map((track) => (
                      <option key={track} value={track}>
                        {track}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={CHEVRON_DOWN_CLASSES}
                  />
                </div>
              </div>
            )}

            {/* Format Filter */}
            {availableFilters.formats.length > 0 && (
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-brand-slate-gray">
                  <TagIcon className="h-3 w-3" />
                  Format
                </label>
                <div className="mt-2 grid grid-cols-1">
                  <select
                    value={filters.selectedFormat}
                    onChange={handleFormatChange}
                    className={DEFAULT_SELECT_CLASSES}
                  >
                    <option value="">All formats</option>
                    {formatOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={CHEVRON_DOWN_CLASSES}
                  />
                </div>
              </div>
            )}

            {/* Level Filter */}
            {availableFilters.levels.length > 0 && (
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-brand-slate-gray">
                  <AcademicCapIcon className="h-3 w-3" />
                  Level
                </label>
                <div className="mt-2 grid grid-cols-1">
                  <select
                    value={filters.selectedLevel}
                    onChange={handleLevelChange}
                    className={DEFAULT_SELECT_CLASSES}
                  >
                    <option value="">All levels</option>
                    {levelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={CHEVRON_DOWN_CLASSES}
                  />
                </div>
              </div>
            )}

            {/* Audience Filter */}
            {availableFilters.audiences.length > 0 && (
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-brand-slate-gray">
                  <UserGroupIcon className="h-3 w-3" />
                  Audience
                </label>
                <div className="mt-2 grid grid-cols-1">
                  <select
                    value={filters.selectedAudience}
                    onChange={handleAudienceChange}
                    className={DEFAULT_SELECT_CLASSES}
                  >
                    <option value="">All audiences</option>
                    {audienceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={CHEVRON_DOWN_CLASSES}
                  />
                </div>
              </div>
            )}

            {/* Topic Filter */}
            {availableFilters.topics.length > 0 && (
              <div className="@sm:col-span-2 @lg:col-span-2">
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-brand-slate-gray">
                  <TagIcon className="h-3 w-3" />
                  Topic
                </label>
                <div className="mt-2 grid grid-cols-1">
                  <select
                    value={filters.selectedTopic}
                    onChange={handleTopicChange}
                    className={DEFAULT_SELECT_CLASSES}
                  >
                    <option value="">All topics</option>
                    {availableFilters.topics.map((topic, index) => (
                      <option
                        key={`${topic.slug.current}-${index}`}
                        value={topic.slug.current}
                      >
                        {topic.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={CHEVRON_DOWN_CLASSES}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
