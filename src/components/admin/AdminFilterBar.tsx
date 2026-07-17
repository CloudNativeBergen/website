'use client'

import { Fragment, ReactNode, useState } from 'react'
import { FunnelIcon } from '@heroicons/react/20/solid'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { FilterDropdown, FilterOption } from '@/components/admin/FilterDropdown'
import { MobileFilterSheet } from '@/components/admin/sponsor-crm/MobileFilterSheet'

/** A single selectable option within a filter group. */
export interface AdminFilterOption {
  /** Stable value used for selection state and callbacks. */
  value: string
  /** Rendered label (may be rich content such as a status badge). */
  label: ReactNode
  /** Render a divider above this option (desktop dropdown only). */
  dividerBefore?: boolean
}

/**
 * Declarative description of a single filter. Rendered as a `FilterDropdown`
 * on desktop and as a chip section inside the mobile bottom sheet.
 */
export interface FilterGroup {
  /** Unique key for the group. */
  key: string
  /** Human readable label shown on the dropdown button / sheet section. */
  label: string
  /** Selectable options. */
  options: AdminFilterOption[]
  /** Currently selected option values. */
  selected: string[]
  /** Toggle (multi) or set (single) the given option value. */
  onChange: (value: string) => void
  /**
   * When `false` the group behaves as a single-select (radio, closes on
   * pick). Defaults to `true` (multi-select checkboxes that keep the menu
   * open).
   */
  multi?: boolean
  /** Message shown when `options` is empty. */
  emptyText?: string
  /** Desktop dropdown panel width. */
  width?: 'default' | 'wide' | 'wider'
  /** Desktop dropdown panel alignment. */
  position?: 'left' | 'right'
}

export interface AdminFilterSearch {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export interface AdminFilterBarProps {
  /** Declarative filter groups. */
  filters: FilterGroup[]
  /** Optional free-text search. */
  search?: AdminFilterSearch
  /** Number of results currently shown (rendered as a status line). */
  resultCount?: number
  /** Total number of results before filtering. */
  totalCount?: number
  /** Noun used in the result count line. */
  resultLabel?: string
  /** Clears all filters. Shown as a desktop link and sheet footer action. */
  onClearAll?: () => void
  /**
   * Override the active filter count shown on the mobile trigger and used to
   * decide sheet footer text. Defaults to the number of non-empty selected
   * values across all groups.
   */
  activeFilterCount?: number
  /**
   * `card` (default) wraps the bar in a padded container with search and
   * result count. `bare` renders only the responsive filter controls so it
   * can be slotted into an existing toolbar.
   */
  variant?: 'card' | 'bare'
  /** Extra controls rendered inline on desktop (e.g. sort, view switcher). */
  desktopExtra?: ReactNode
  /** Extra controls rendered inside the mobile sheet body. */
  sheetExtra?: ReactNode
  /** Label for the mobile filter trigger. Defaults to "Filters". */
  mobileFilterLabel?: string
  className?: string
}

/** Number of "active" selections in a group (ignores empty-string sentinels). */
export function groupActiveCount(group: FilterGroup): number {
  return group.selected.filter((value) => value !== '').length
}

function DesktopFilterDropdown({ group }: { group: FilterGroup }) {
  const isMulti = group.multi !== false
  return (
    <FilterDropdown
      label={group.label}
      activeCount={groupActiveCount(group)}
      position={group.position ?? 'left'}
      width={group.width ?? 'default'}
      size="sm"
    >
      {group.options.length === 0 ? (
        <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
          {group.emptyText ?? 'No options available'}
        </div>
      ) : (
        group.options.map((option) => (
          <Fragment key={option.value}>
            {option.dividerBefore && (
              <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            )}
            <FilterOption
              onClick={() => group.onChange(option.value)}
              checked={group.selected.includes(option.value)}
              type={isMulti ? 'checkbox' : 'radio'}
              keepOpen={isMulti}
            >
              {option.label}
            </FilterOption>
          </Fragment>
        ))
      )}
    </FilterDropdown>
  )
}

/**
 * Shared, responsive filter bar for the admin area.
 *
 * Desktop (`lg+`): an inline row of dropdowns, optional search and a result
 * count. Below `lg`: the dropdowns collapse into a single "Filters (n)"
 * button that opens a full-height bottom sheet.
 */
export function AdminFilterBar({
  filters,
  search,
  resultCount,
  totalCount,
  resultLabel = 'items',
  onClearAll,
  activeFilterCount,
  variant = 'card',
  desktopExtra,
  sheetExtra,
  mobileFilterLabel = 'Filters',
  className,
}: AdminFilterBarProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  const computedActiveCount =
    activeFilterCount ??
    filters.reduce((total, group) => total + groupActiveCount(group), 0)

  const hasResultCount = resultCount !== undefined
  const hasMobileTrigger = filters.length > 0 || sheetExtra !== undefined

  const filterControls = (
    <>
      {/* Desktop: inline dropdown row */}
      <div className="hidden items-center gap-1.5 lg:flex">
        {filters.map((group) => (
          <DesktopFilterDropdown key={group.key} group={group} />
        ))}
        {desktopExtra}
        {variant !== 'bare' && onClearAll && computedActiveCount > 0 && (
          <button
            onClick={onClearAll}
            className="ml-1 text-sm font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            Clear all ({computedActiveCount})
          </button>
        )}
      </div>

      {/* Mobile: single trigger opening the bottom sheet */}
      {hasMobileTrigger && (
        <button
          onClick={() => setIsSheetOpen(true)}
          className={clsx(
            'relative flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors lg:hidden',
            computedActiveCount > 0
              ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300 ring-inset dark:bg-indigo-900/40 dark:text-indigo-300 dark:ring-indigo-700'
              : 'text-gray-600 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:text-gray-400 dark:ring-white/10 dark:hover:bg-gray-800',
          )}
        >
          <FunnelIcon className="h-4 w-4" />
          <span>{mobileFilterLabel}</span>
          {computedActiveCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white dark:bg-indigo-500">
              {computedActiveCount}
            </span>
          )}
        </button>
      )}

      <MobileFilterSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        groups={filters}
        onClearAll={onClearAll ?? (() => {})}
        activeFilterCount={computedActiveCount}
        extra={sheetExtra}
      />
    </>
  )

  if (variant === 'bare') {
    return filterControls
  }

  return (
    <div
      className={clsx(
        'space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800',
        className,
      )}
    >
      <div className="flex flex-row items-center gap-2 lg:justify-between lg:gap-3">
        <div
          className={clsx(
            'flex items-center gap-2 lg:flex-none',
            search && 'flex-1',
          )}
        >
          {search && (
            <div className="relative w-full lg:w-64">
              <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search.value}
                onChange={(event) => search.onChange(event.target.value)}
                placeholder={search.placeholder ?? 'Search...'}
                className="block h-9 w-full rounded-md border-gray-300 bg-white py-1.5 pr-8 pl-9 text-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-500"
              />
              {search.value && (
                <button
                  onClick={() => search.onChange('')}
                  className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  aria-label="Clear search"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filterControls}
        </div>
      </div>

      {hasResultCount && (
        <div
          role="status"
          aria-live="polite"
          className="text-sm text-gray-500 dark:text-gray-400"
        >
          Showing {resultCount}
          {totalCount !== undefined && totalCount !== resultCount && (
            <> of {totalCount}</>
          )}{' '}
          {resultLabel}
        </div>
      )}
    </div>
  )
}
