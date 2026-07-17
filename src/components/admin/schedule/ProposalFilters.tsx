'use client'

import {
  FunnelIcon,
  XMarkIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline'
import { SearchInput } from '@/components/SearchInput'
import { FilterSelect } from '@/components/FilterSelect'
import type { ProposalFilterState } from './useProposalFilters'

const SEARCH_INPUT_CLASSES =
  'w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-500 focus:border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400 dark:focus:bg-gray-600'

const FormatFilter = ({
  selectedFormat,
  availableFormats,
  onFormatChange,
}: {
  selectedFormat: string
  availableFormats: string[]
  onFormatChange: (value: string) => void
}) => (
  <FilterSelect
    icon={FunnelIcon}
    value={selectedFormat}
    onChange={onFormatChange}
    ariaLabel="Filter by format"
    options={
      new Map(
        availableFormats.map((format) => [
          format,
          format.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        ]),
      )
    }
    allLabel="All formats"
  />
)

const LevelFilter = ({
  selectedLevel,
  availableLevels,
  onLevelChange,
}: {
  selectedLevel: string
  availableLevels: string[]
  onLevelChange: (value: string) => void
}) => (
  <FilterSelect
    icon={AdjustmentsHorizontalIcon}
    value={selectedLevel}
    onChange={onLevelChange}
    ariaLabel="Filter by level"
    options={
      new Map(
        availableLevels.map((level) => [
          level,
          level.charAt(0).toUpperCase() + level.slice(1),
        ]),
      )
    }
    allLabel="All levels"
  />
)

/**
 * Search + format + level filter controls, driven by {@link ProposalFilterState}
 * from `useProposalFilters`. Shared by the desktop `UnassignedProposals` sidebar
 * and the mobile assign sheet so the filter UX stays identical.
 */
export function ProposalFilters({
  filters,
  clearButtonClassName,
}: {
  filters: ProposalFilterState
  clearButtonClassName?: string
}) {
  return (
    <div className="space-y-3">
      {filters.hasActiveFilters && (
        <button
          onClick={filters.clearFilters}
          className={
            clearButtonClassName ??
            'absolute top-2 right-2 inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white/90 px-2 py-1 text-xs font-medium text-gray-600 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-gray-800 focus:ring-2 focus:ring-gray-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800/90 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100'
          }
          type="button"
          title="Clear all filters"
        >
          <XMarkIcon className="h-3 w-3" />
          Clear
        </button>
      )}

      <SearchInput
        value={filters.searchQuery}
        onChange={filters.setSearchQuery}
        placeholder="Search talks or speakers..."
        inputClassName={SEARCH_INPUT_CLASSES}
      />

      <FormatFilter
        selectedFormat={filters.selectedFormat}
        availableFormats={filters.availableFormats}
        onFormatChange={filters.setSelectedFormat}
      />

      <LevelFilter
        selectedLevel={filters.selectedLevel}
        availableLevels={filters.availableLevels}
        onLevelChange={filters.setSelectedLevel}
      />
    </div>
  )
}
