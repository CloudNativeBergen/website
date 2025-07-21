'use client'

import { FunnelIcon } from '@heroicons/react/20/solid'
import {
  Status,
  Format,
  Level,
  Language,
  Audience,
  statuses,
  formats,
  levels,
} from '@/lib/proposal/types'
import { FilterDropdown, FilterOption } from './FilterDropdown'
import { getStatusBadgeStyle } from './utils'

export enum ReviewStatus {
  unreviewed = 'unreviewed',
  reviewed = 'reviewed',
  all = 'all',
}

export interface FilterState {
  status: Status[]
  format: Format[]
  level: Level[]
  language: Language[]
  audience: Audience[]
  reviewStatus: ReviewStatus
  hideMultipleTalks: boolean
  sortBy: 'title' | 'status' | 'created' | 'speaker' | 'rating'
  sortOrder: 'asc' | 'desc'
}

interface ProposalsFilterProps {
  filters: FilterState
  onFilterChange: (
    filterType: keyof FilterState,
    value: Status | Format | Level | Language | Audience,
  ) => void
  onReviewStatusChange: (reviewStatus: ReviewStatus) => void
  onMultipleTalksFilterChange: (hideMultipleTalks: boolean) => void
  onSortChange: (sortBy: FilterState['sortBy']) => void
  onSortOrderToggle: () => void
  onClearAll: () => void
  activeFilterCount: number
  currentUserId?: string
  allowedFormats?: Format[]
}

/**
 * Comprehensive filtering interface for proposals
 * Provides status, format, level filters and sorting options
 */
export function ProposalsFilter({
  filters,
  onFilterChange,
  onReviewStatusChange,
  onMultipleTalksFilterChange,
  onSortChange,
  onSortOrderToggle,
  onClearAll,
  activeFilterCount,
  currentUserId,
  allowedFormats,
}: ProposalsFilterProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2">
            <FunnelIcon className="h-5 w-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>

          {/* Status Filter */}
          <FilterDropdown
            label="Status"
            activeCount={filters.status.length}
            keepOpen
          >
            {Object.values(Status).map((status) => (
              <FilterOption
                key={status}
                onClick={() => onFilterChange('status', status)}
                checked={filters.status.includes(status)}
                type="checkbox"
                keepOpen
              >
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeStyle(status)}`}
                >
                  {statuses.get(status)}
                </span>
              </FilterOption>
            ))}
          </FilterDropdown>

          {/* Format Filter */}
          <FilterDropdown
            label="Format"
            activeCount={filters.format.length}
            keepOpen
          >
            {(allowedFormats || Object.values(Format)).map((format) => (
              <FilterOption
                key={format}
                onClick={() => onFilterChange('format', format)}
                checked={filters.format.includes(format)}
                type="checkbox"
                keepOpen
              >
                {formats.get(format)}
              </FilterOption>
            ))}
          </FilterDropdown>

          {/* Level Filter */}
          <FilterDropdown
            label="Level"
            activeCount={filters.level.length}
            keepOpen
          >
            {Object.values(Level).map((level) => (
              <FilterOption
                key={level}
                onClick={() => onFilterChange('level', level)}
                checked={filters.level.includes(level)}
                type="checkbox"
                keepOpen
              >
                {levels.get(level)}
              </FilterOption>
            ))}
          </FilterDropdown>

          {/* Hide Multiple Talks Filter */}
          <FilterDropdown
            label={
              filters.hideMultipleTalks
                ? 'Speaker Filter: Active'
                : 'Speaker Filter'
            }
            activeCount={filters.hideMultipleTalks ? 1 : 0}
            keepOpen
          >
            <FilterOption
              onClick={() =>
                onMultipleTalksFilterChange(!filters.hideMultipleTalks)
              }
              checked={filters.hideMultipleTalks}
              type="checkbox"
              keepOpen
            >
              <div className="flex flex-col space-y-1 text-left">
                <span className="font-medium text-gray-900">
                  Hide speakers with accepted talks
                </span>
                <span className="max-w-xs text-xs leading-relaxed text-gray-500">
                  Only show submitted proposals from speakers who don&apos;t
                  already have accepted or confirmed talks
                </span>
              </div>
            </FilterOption>
          </FilterDropdown>
        </div>

        <div className="flex items-center gap-3">
          {/* Review Status Filter - only show if user is logged in */}
          {currentUserId && (
            <FilterDropdown
              label={`My Reviews: ${filters.reviewStatus === ReviewStatus.unreviewed ? 'Todo' : filters.reviewStatus === ReviewStatus.reviewed ? 'Done' : 'All'}`}
              activeCount={filters.reviewStatus !== ReviewStatus.all ? 1 : 0}
              position="right"
              width="wide"
            >
              {Object.values(ReviewStatus).map((status) => (
                <FilterOption
                  key={status}
                  onClick={() => onReviewStatusChange(status)}
                  checked={filters.reviewStatus === status}
                  type="radio"
                >
                  {status === ReviewStatus.unreviewed
                    ? 'Todo (not reviewed by me)'
                    : status === ReviewStatus.reviewed
                      ? 'Done (reviewed by me)'
                      : 'All proposals'}
                </FilterOption>
              ))}
            </FilterDropdown>
          )}

          {/* Sort Options */}
          <FilterDropdown
            label={`Sort: ${filters.sortBy === 'created' ? 'Date' : filters.sortBy === 'speaker' ? 'Speaker' : filters.sortBy === 'rating' ? 'Rating' : filters.sortBy}`}
            activeCount={0}
            position="right"
          >
            {[
              { key: 'created', label: 'Date Created' },
              { key: 'title', label: 'Title' },
              { key: 'speaker', label: 'Speaker' },
              { key: 'status', label: 'Status' },
              { key: 'rating', label: 'Rating' },
            ].map((option) => (
              <FilterOption
                key={option.key}
                onClick={() =>
                  onSortChange(option.key as FilterState['sortBy'])
                }
                checked={filters.sortBy === option.key}
                type="radio"
              >
                {option.label}
              </FilterOption>
            ))}
            <hr className="my-1" />
            <FilterOption
              onClick={onSortOrderToggle}
              checked={false}
              type="checkbox"
            >
              {filters.sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
            </FilterOption>
          </FilterDropdown>

          {activeFilterCount > 0 && (
            <button
              onClick={onClearAll}
              className="text-sm text-indigo-600 hover:text-indigo-500"
            >
              Clear all ({activeFilterCount})
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
