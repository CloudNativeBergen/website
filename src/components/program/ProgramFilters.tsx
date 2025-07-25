import React, { useState } from 'react'
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

const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function ProgramFilters({
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

  return (
    <div className="space-y-4 rounded-lg border border-brand-frosted-steel bg-brand-glacier-white p-4">
      {/* Compact Header with View Mode Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-brand-cloud-blue" />
            <h3 className="font-space-grotesk text-base font-semibold text-brand-slate-gray">
              Filters
            </h3>
          </div>
          <div className="rounded-md bg-brand-sky-mist px-2 py-1">
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
                Clear
              </button>
            )}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex min-w-[60px] items-center justify-center gap-1 rounded-md px-2 py-1 text-xs text-brand-slate-gray transition-colors hover:bg-brand-sky-mist"
            >
              {isExpanded ? (
                <>
                  <ChevronUpIcon className="h-3 w-3" />
                  <span className="w-8 text-left">Less</span>
                </>
              ) : (
                <>
                  <ChevronDownIcon className="h-3 w-3" />
                  <span className="w-8 text-left">More</span>
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
          onChange={(e) => onFilterChange('searchQuery', e.target.value)}
          className="block w-full rounded-md border-0 py-1.5 pr-3 pl-10 text-gray-900 ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-brand-cloud-blue focus:ring-inset sm:text-sm sm:leading-6"
        />
      </div>

      {/* Expandable Filters */}
      {isExpanded && (
        <div className="space-y-4 border-t border-brand-frosted-steel pt-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {/* Day Filter */}
            {availableFilters.days.length > 1 && (
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-brand-slate-gray">
                  <CalendarDaysIcon className="h-3 w-3" />
                  Day
                </label>
                <select
                  value={filters.selectedDay}
                  onChange={(e) =>
                    onFilterChange('selectedDay', e.target.value)
                  }
                  className="block w-full rounded-md border-0 py-1.5 pr-10 pl-3 text-gray-900 ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-brand-cloud-blue focus:ring-inset sm:text-sm sm:leading-6"
                >
                  <option value="">All days</option>
                  {availableFilters.days.map((day) => (
                    <option key={day} value={day}>
                      {formatDate(day)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Track Filter */}
            {availableFilters.tracks.length > 1 && (
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-brand-slate-gray">
                  <MapIcon className="h-3 w-3" />
                  Track
                </label>
                <select
                  value={filters.selectedTrack}
                  onChange={(e) =>
                    onFilterChange('selectedTrack', e.target.value)
                  }
                  className="block w-full rounded-md border-0 py-1.5 pr-10 pl-3 text-gray-900 ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-brand-cloud-blue focus:ring-inset sm:text-sm sm:leading-6"
                >
                  <option value="">All tracks</option>
                  {availableFilters.tracks.map((track) => (
                    <option key={track} value={track}>
                      {track}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Format Filter */}
            {availableFilters.formats.length > 0 && (
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-brand-slate-gray">
                  <TagIcon className="h-3 w-3" />
                  Format
                </label>
                <select
                  value={filters.selectedFormat}
                  onChange={(e) =>
                    onFilterChange(
                      'selectedFormat',
                      e.target.value as Format | '',
                    )
                  }
                  className="block w-full rounded-md border-0 py-1.5 pr-10 pl-3 text-gray-900 ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-brand-cloud-blue focus:ring-inset sm:text-sm sm:leading-6"
                >
                  <option value="">All formats</option>
                  {availableFilters.formats.map((format) => {
                    const config = getFormatConfig(format)
                    return (
                      <option key={format} value={format}>
                        {config.label} ({config.duration})
                      </option>
                    )
                  })}
                </select>
              </div>
            )}

            {/* Level Filter */}
            {availableFilters.levels.length > 0 && (
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-brand-slate-gray">
                  <AcademicCapIcon className="h-3 w-3" />
                  Level
                </label>
                <select
                  value={filters.selectedLevel}
                  onChange={(e) =>
                    onFilterChange(
                      'selectedLevel',
                      e.target.value as Level | '',
                    )
                  }
                  className="block w-full rounded-md border-0 py-1.5 pr-10 pl-3 text-gray-900 ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-brand-cloud-blue focus:ring-inset sm:text-sm sm:leading-6"
                >
                  <option value="">All levels</option>
                  {availableFilters.levels.map((level) => {
                    const config = getLevelConfig(level)
                    return (
                      <option key={level} value={level}>
                        {config?.label || level}
                      </option>
                    )
                  })}
                </select>
              </div>
            )}

            {/* Audience Filter */}
            {availableFilters.audiences.length > 0 && (
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-brand-slate-gray">
                  <UserGroupIcon className="h-3 w-3" />
                  Audience
                </label>
                <select
                  value={filters.selectedAudience}
                  onChange={(e) =>
                    onFilterChange(
                      'selectedAudience',
                      e.target.value as Audience | '',
                    )
                  }
                  className="block w-full rounded-md border-0 py-1.5 pr-10 pl-3 text-gray-900 ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-brand-cloud-blue focus:ring-inset sm:text-sm sm:leading-6"
                >
                  <option value="">All audiences</option>
                  {availableFilters.audiences.map((audience) => {
                    const config = getAudienceBadgeConfig(audience)
                    return (
                      <option key={audience} value={audience}>
                        {config.text}
                      </option>
                    )
                  })}
                </select>
              </div>
            )}

            {/* Topic Filter */}
            {availableFilters.topics.length > 0 && (
              <div className="lg:col-span-2">
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-brand-slate-gray">
                  <TagIcon className="h-3 w-3" />
                  Topic
                </label>
                <select
                  value={filters.selectedTopic}
                  onChange={(e) =>
                    onFilterChange('selectedTopic', e.target.value)
                  }
                  className="block w-full rounded-md border-0 py-1.5 pr-10 pl-3 text-gray-900 ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-brand-cloud-blue focus:ring-inset sm:text-sm sm:leading-6"
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
