'use client'

import {
  FunnelIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { SearchInput } from '@/components/SearchInput'
import type { ProposalFilterState } from './useProposalFilters'

const SEARCH_INPUT_CLASSES =
  'w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-10 pr-8 text-sm text-gray-900 placeholder:text-gray-500 focus:border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400 dark:focus:bg-gray-600'

import { ChevronDownIcon } from '@heroicons/react/16/solid'

const UnifiedFilter = ({ filters }: { filters: ProposalFilterState }) => {
  const unifiedValue = filters.selectedFormat
    ? `format:${filters.selectedFormat}`
    : filters.selectedLevel
      ? `level:${filters.selectedLevel}`
      : ''

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (val.startsWith('format:')) {
      filters.setSelectedFormat(val.replace('format:', ''))
      filters.setSelectedLevel('')
    } else if (val.startsWith('level:')) {
      filters.setSelectedLevel(val.replace('level:', ''))
      filters.setSelectedFormat('')
    } else {
      filters.setSelectedFormat('')
      filters.setSelectedLevel('')
    }
  }

  return (
    <div className="relative h-full">
      <FunnelIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
      <select
        value={unifiedValue}
        onChange={onChange}
        aria-label="Filter talks"
        className="h-full w-full cursor-pointer appearance-none rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-7 text-sm text-gray-900 transition-all focus:border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:bg-gray-600"
      >
        <option value="">Filter...</option>
        {filters.availableFormats.length > 0 && (
          <optgroup label="Format">
            {filters.availableFormats.map((f) => (
              <option key={`format:${f}`} value={`format:${f}`}>
                {f.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </option>
            ))}
          </optgroup>
        )}
        {filters.availableLevels.length > 0 && (
          <optgroup label="Level">
            {filters.availableLevels.map((l) => (
              <option key={`level:${l}`} value={`level:${l}`}>
                {l.charAt(0).toUpperCase() + l.slice(1)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 sm:h-4 sm:w-4 dark:text-gray-400"
      />
    </div>
  )
}

/**
 * Search + format + level filter controls, driven by {@link ProposalFilterState}
 * from `useProposalFilters`. Shared by the desktop `UnassignedProposals` sidebar
 * and the mobile assign sheet so the filter UX stays identical.
 */
export function ProposalFilters({
  filters,
}: {
  filters: ProposalFilterState
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-[3]">
          <SearchInput
            value={filters.searchQuery}
            onChange={filters.setSearchQuery}
            placeholder="Search talks..."
            inputClassName={SEARCH_INPUT_CLASSES}
          />
          {filters.hasActiveFilters && (
            <button
              onClick={filters.clearFilters}
              type="button"
              title="Clear all filters"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition-colors hover:text-gray-800 dark:text-gray-500 dark:hover:text-gray-200"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex-[2]">
          <UnifiedFilter filters={filters} />
        </div>
      </div>
    </div>
  )
}
