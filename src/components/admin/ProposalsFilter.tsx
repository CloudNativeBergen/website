'use client'

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
import { Flags } from '@/lib/speaker/types'
import { FilterDropdown, FilterOption } from './FilterDropdown'
import { getStatusBadgeConfig } from '@/lib/proposal/ui'
import {
  AdminFilterBar,
  type FilterGroup,
} from '@/components/admin/AdminFilterBar'
import { FilterSection } from '@/components/admin/sponsor-crm/MobileFilterSheet'
import clsx from 'clsx'

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
  speakerFlags: Flags[]
  reviewStatus: ReviewStatus
  hideMultipleTalks: boolean
  searchQuery: string
  sortBy: 'title' | 'status' | 'created' | 'speaker' | 'rating' | 'reviews'
  sortOrder: 'asc' | 'desc'
}

interface ProposalsFilterProps {
  filters: FilterState
  onFilterChange: (
    filterType: keyof FilterState,
    value: Status | Format | Level | Language | Audience | Flags,
  ) => void
  onReviewStatusChange: (reviewStatus: ReviewStatus) => void
  onSearchChange: (query: string) => void
  onMultipleTalksFilterChange: (hideMultipleTalks: boolean) => void
  onSortChange: (sortBy: FilterState['sortBy']) => void
  onSortOrderToggle: () => void
  onClearAll: () => void
  activeFilterCount: number
  currentUserId?: string
  allowedFormats?: Format[]
}

const SORT_OPTIONS: { key: FilterState['sortBy']; label: string }[] = [
  { key: 'created', label: 'Date Created' },
  { key: 'title', label: 'Title' },
  { key: 'speaker', label: 'Speaker' },
  { key: 'status', label: 'Status' },
  { key: 'rating', label: 'Rating' },
  { key: 'reviews', label: 'Review Count' },
]

const SORT_LABELS: Record<FilterState['sortBy'], string> = {
  created: 'Date',
  title: 'Title',
  speaker: 'Speaker',
  status: 'Status',
  rating: 'Rating',
  reviews: 'Review Count',
}

// Sentinel value used to model the "hide speakers with accepted talks" toggle
// as a regular option inside the declarative Speakers filter group.
const HIDE_MULTIPLE_TALKS = 'hideMultipleTalks'

export function ProposalsFilter({
  filters,
  onFilterChange,
  onReviewStatusChange,
  onSearchChange,
  onMultipleTalksFilterChange,
  onSortChange,
  onSortOrderToggle,
  onClearAll,
  activeFilterCount,
  currentUserId,
  allowedFormats,
}: ProposalsFilterProps) {
  const filterGroups: FilterGroup[] = [
    {
      key: 'status',
      label: 'Status',
      options: Object.values(Status).map((status) => ({
        value: status,
        label: (
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeConfig(status).bgColor} ${getStatusBadgeConfig(status).textColor}`}
          >
            {statuses.get(status)}
          </span>
        ),
      })),
      selected: filters.status,
      onChange: (value) => onFilterChange('status', value as Status),
    },
    {
      key: 'format',
      label: 'Format',
      options: (allowedFormats || Object.values(Format)).map((format) => ({
        value: format,
        label: formats.get(format) ?? format,
      })),
      selected: filters.format,
      onChange: (value) => onFilterChange('format', value as Format),
    },
    {
      key: 'level',
      label: 'Level',
      options: Object.values(Level).map((level) => ({
        value: level,
        label: levels.get(level) ?? level,
      })),
      selected: filters.level,
      onChange: (value) => onFilterChange('level', value as Level),
    },
    {
      key: 'speakers',
      label: 'Speakers',
      width: 'wider',
      options: [
        {
          value: HIDE_MULTIPLE_TALKS,
          label: (
            <div className="flex flex-col space-y-1 text-left">
              <span className="font-medium text-gray-900 dark:text-white">
                Hide speakers with accepted talks
              </span>
              <span className="max-w-xs text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                Only show submitted proposals from speakers who don&apos;t
                already have accepted or confirmed talks
              </span>
            </div>
          ),
        },
        {
          value: Flags.diverseSpeaker,
          label: 'Underrepresented speakers',
          dividerBefore: true,
        },
        { value: Flags.firstTimeSpeaker, label: 'New speakers' },
        { value: Flags.localSpeaker, label: 'Local speakers' },
        {
          value: Flags.requiresTravelFunding,
          label: 'Requires travel funding',
        },
      ],
      selected: [
        ...(filters.hideMultipleTalks ? [HIDE_MULTIPLE_TALKS] : []),
        ...filters.speakerFlags,
      ],
      onChange: (value) => {
        if (value === HIDE_MULTIPLE_TALKS) {
          onMultipleTalksFilterChange(!filters.hideMultipleTalks)
        } else {
          onFilterChange('speakerFlags', value as Flags)
        }
      },
    },
  ]

  if (currentUserId) {
    filterGroups.push({
      key: 'reviews',
      label: 'Reviews',
      width: 'wide',
      position: 'right',
      multi: false,
      selected: [filters.reviewStatus],
      onChange: (value) => onReviewStatusChange(value as ReviewStatus),
      options: [
        { value: ReviewStatus.unreviewed, label: 'Todo (not reviewed by me)' },
        { value: ReviewStatus.reviewed, label: 'Done (reviewed by me)' },
        { value: ReviewStatus.all, label: 'All proposals' },
      ],
    })
  }

  const sortDropdown = (
    <FilterDropdown
      label={`Sort: ${SORT_LABELS[filters.sortBy]}`}
      activeCount={0}
      position="right"
      size="sm"
    >
      {SORT_OPTIONS.map((option) => (
        <FilterOption
          key={option.key}
          onClick={() => onSortChange(option.key)}
          checked={filters.sortBy === option.key}
          type="radio"
        >
          {option.label}
        </FilterOption>
      ))}
      <hr className="my-1" />
      <FilterOption onClick={onSortOrderToggle} checked={false} type="checkbox">
        {filters.sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
      </FilterOption>
    </FilterDropdown>
  )

  const sortSheet = (
    <FilterSection title={`Sort: ${SORT_LABELS[filters.sortBy]}`}>
      <div className="flex flex-wrap gap-2">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.key}
            onClick={() => onSortChange(option.key)}
            className={clsx(
              'flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium transition-colors',
              filters.sortBy === option.key
                ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300 ring-inset dark:bg-indigo-900/40 dark:text-indigo-300 dark:ring-indigo-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
            )}
          >
            {option.label}
          </button>
        ))}
        <button
          onClick={onSortOrderToggle}
          className="flex min-h-11 items-center rounded-full bg-gray-100 px-3.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {filters.sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
        </button>
      </div>
    </FilterSection>
  )

  return (
    <AdminFilterBar
      filters={filterGroups}
      search={{
        value: filters.searchQuery,
        onChange: onSearchChange,
        placeholder: 'Search proposals or speakers...',
      }}
      onClearAll={onClearAll}
      activeFilterCount={activeFilterCount}
      desktopExtra={sortDropdown}
      sheetExtra={sortSheet}
      mobileFilterLabel="Filters"
    />
  )
}
