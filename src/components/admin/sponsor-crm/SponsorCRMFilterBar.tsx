'use client'

import {
  MagnifyingGlassIcon,
  XMarkIcon,
  FunnelIcon,
} from '@heroicons/react/20/solid'
import { FilterDropdown, FilterOption } from '@/components/admin/FilterDropdown'
import {
  BoardViewSwitcher,
  type BoardView,
} from '@/components/admin/sponsor-crm/BoardViewSwitcher'
import {
  sortSponsorTiers,
  formatTierLabel,
} from '@/components/admin/sponsor-crm/utils'
import { TAGS } from '@/components/admin/sponsor-crm/form/constants'
import type { SponsorTag } from '@/lib/sponsor-crm/types'
import type { SponsorTier } from '@/lib/sponsor/types'
import clsx from 'clsx'

export interface Organizer {
  _id: string
  name: string
  email: string
  avatar?: string
}

export interface SponsorCRMFilterBarProps {
  /** Current board view mode */
  currentView: BoardView
  /** Callback when view changes */
  onViewChange: (view: BoardView) => void
  /** Search query string */
  searchQuery: string
  /** Callback when search query changes */
  onSearchChange: (query: string) => void
  /** Available sponsor tiers for filtering */
  tiers: SponsorTier[]
  /** Currently selected tier IDs */
  tiersFilter: string[]
  /** Callback to toggle a tier filter */
  onToggleTier: (tierId: string) => void
  /** Available organizers for filtering */
  organizers: Organizer[]
  /** Currently selected organizer ID or 'unassigned' */
  assignedToFilter?: string
  /** Callback to set organizer filter */
  onSetOrganizer: (organizerId: string | null) => void
  /** Currently selected tags */
  tagsFilter: SponsorTag[]
  /** Callback to toggle a tag filter */
  onToggleTag: (tag: SponsorTag) => void
  /** Callback to clear all filters */
  onClearAllFilters: () => void
  /** Number of selected items */
  selectedCount: number
  /** Callback to select all filtered items */
  onSelectAll: () => void
  /** Callback to clear selection */
  onClearSelection: () => void
  /** Whether mobile search is open */
  isMobileSearchOpen?: boolean
  /** Callback to toggle mobile search */
  onToggleMobileSearch?: () => void
  /** Callback to open mobile filter sheet */
  onOpenMobileFilter?: () => void
}

export function SponsorCRMFilterBar({
  currentView,
  onViewChange,
  searchQuery,
  onSearchChange,
  tiers,
  tiersFilter,
  onToggleTier,
  organizers,
  assignedToFilter,
  onSetOrganizer,
  tagsFilter,
  onToggleTag,
  onClearAllFilters,
  selectedCount,
  onSelectAll,
  onClearSelection,
  isMobileSearchOpen = false,
  onToggleMobileSearch,
  onOpenMobileFilter,
}: SponsorCRMFilterBarProps) {
  const activeFilterCount =
    tiersFilter.length + (assignedToFilter ? 1 : 0) + tagsFilter.length

  return (
    <div className="shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2 p-2 sm:gap-3">
        {/* View Switcher */}
        <div className="shrink-0">
          <BoardViewSwitcher
            currentView={currentView}
            onViewChange={onViewChange}
          />
        </div>

        <div className="hidden h-6 w-px bg-gray-200 sm:block dark:bg-gray-700" />

        {/* Search - desktop: always visible, mobile: expandable */}
        <div className="hidden grow sm:block">
          <div className="group relative max-w-sm">
            <MagnifyingGlassIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-indigo-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search sponsors..."
              className="h-9 w-full rounded-lg bg-gray-50 pr-8 pl-9 text-sm ring-1 ring-gray-300 transition-all ring-inset focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:ring-inset dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-500 dark:focus:bg-white/10"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile: search toggle */}
        {onToggleMobileSearch && (
          <button
            onClick={onToggleMobileSearch}
            className={clsx(
              'ml-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors sm:hidden',
              isMobileSearchOpen || searchQuery
                ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
            )}
          >
            <MagnifyingGlassIcon className="h-4.5 w-4.5" />
          </button>
        )}

        <div className="hidden h-6 w-px bg-gray-200 sm:block dark:bg-gray-700" />

        {/* Filter dropdowns - desktop only */}
        <div className="hidden items-center gap-1.5 lg:flex">
          <FilterDropdown
            label="Tier"
            activeCount={tiersFilter.length}
            position="left"
            size="sm"
          >
            {tiers.length === 0 ? (
              <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                No tiers available
              </div>
            ) : (
              sortSponsorTiers(tiers).map((tier: SponsorTier) => (
                <FilterOption
                  key={tier._id}
                  onClick={() => onToggleTier(tier._id)}
                  checked={tiersFilter.includes(tier._id)}
                  keepOpen
                >
                  {formatTierLabel(tier)}
                </FilterOption>
              ))
            )}
          </FilterDropdown>

          <FilterDropdown
            label="Owner"
            activeCount={assignedToFilter ? 1 : 0}
            position="left"
            size="sm"
          >
            <FilterOption
              onClick={() => onSetOrganizer(null)}
              checked={!assignedToFilter}
              type="radio"
            >
              All Owners
            </FilterOption>
            <FilterOption
              onClick={() => onSetOrganizer('unassigned')}
              checked={assignedToFilter === 'unassigned'}
              type="radio"
            >
              Unassigned
            </FilterOption>
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            {organizers.map((organizer) => (
              <FilterOption
                key={organizer._id}
                onClick={() => onSetOrganizer(organizer._id)}
                checked={assignedToFilter === organizer._id}
                type="radio"
              >
                {organizer.name}
              </FilterOption>
            ))}
          </FilterDropdown>

          <FilterDropdown
            label="Tags"
            activeCount={tagsFilter.length}
            position="left"
            size="sm"
          >
            {TAGS.map((tag) => (
              <FilterOption
                key={tag.value}
                onClick={() => onToggleTag(tag.value)}
                checked={tagsFilter.includes(tag.value)}
                keepOpen
              >
                {tag.label}
              </FilterOption>
            ))}
          </FilterDropdown>
        </div>

        {/* Mobile: Filter button with badge */}
        {onOpenMobileFilter && (
          <button
            onClick={onOpenMobileFilter}
            className={clsx(
              'relative flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors lg:hidden',
              activeFilterCount > 0
                ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300 ring-inset dark:bg-indigo-900/40 dark:text-indigo-300 dark:ring-indigo-700'
                : 'text-gray-600 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:text-gray-400 dark:ring-white/10 dark:hover:bg-gray-800',
            )}
          >
            <FunnelIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Filter</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white dark:bg-indigo-500">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}

        <div className="ml-auto hidden h-6 w-px bg-gray-200 sm:block dark:bg-gray-700" />

        {/* Select all / Clear selection */}
        {selectedCount === 0 ? (
          <button
            onClick={onSelectAll}
            className="hidden h-9 items-center justify-center rounded-lg bg-white px-3 text-xs font-medium text-gray-600 ring-1 ring-gray-300 transition-all ring-inset hover:bg-indigo-50 hover:text-indigo-600 sm:flex dark:bg-white/5 dark:text-gray-400 dark:ring-white/10 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400"
          >
            Select all
          </button>
        ) : (
          <button
            onClick={onClearSelection}
            className="hidden h-9 items-center justify-center rounded-lg bg-white px-3 text-xs font-medium text-red-600 ring-1 ring-gray-300 transition-all ring-inset hover:bg-red-50 hover:ring-red-200 sm:flex dark:bg-white/5 dark:text-red-400 dark:ring-white/10 dark:hover:bg-red-900/20 dark:hover:ring-red-900/30"
          >
            Clear ({selectedCount})
          </button>
        )}
      </div>

      {/* Mobile: expandable search row */}
      {isMobileSearchOpen && (
        <div className="border-t border-gray-200 px-2 py-2 sm:hidden dark:border-gray-800">
          <div className="group relative">
            <MagnifyingGlassIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-indigo-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search sponsors..."
              autoFocus
              className="h-9 w-full rounded-lg bg-gray-50 pr-8 pl-9 text-sm ring-1 ring-gray-300 transition-all ring-inset focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:ring-inset dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-500 dark:focus:bg-white/10"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Row 2: Active filter pills (appears only when filters are active) */}
      {(activeFilterCount > 0 || searchQuery) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-200 px-2.5 py-2 dark:border-gray-800">
          {/* Tier pills */}
          {tiersFilter.map((tierId) => {
            const tier = tiers.find((t) => t._id === tierId)
            return (
              <FilterPill
                key={`tier-${tierId}`}
                label={tier ? formatTierLabel(tier) : tierId}
                category="Tier"
                onRemove={() => onToggleTier(tierId)}
              />
            )
          })}

          {/* Owner pill */}
          {assignedToFilter && (
            <FilterPill
              label={
                assignedToFilter === 'unassigned'
                  ? 'Unassigned'
                  : organizers.find((o) => o._id === assignedToFilter)?.name ||
                    'Owner'
              }
              category="Owner"
              onRemove={() => onSetOrganizer(null)}
            />
          )}

          {/* Tag pills */}
          {tagsFilter.map((tag) => {
            const tagDef = TAGS.find((t) => t.value === tag)
            return (
              <FilterPill
                key={`tag-${tag}`}
                label={tagDef?.label || tag}
                category="Tag"
                onRemove={() => onToggleTag(tag)}
              />
            )
          })}

          {/* Search pill */}
          {searchQuery && (
            <FilterPill
              label={searchQuery}
              category="Search"
              onRemove={() => onSearchChange('')}
            />
          )}

          {/* Clear all */}
          <button
            onClick={onClearAllFilters}
            className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}

interface FilterPillProps {
  label: string
  category: string
  onRemove: () => void
}

export function FilterPill({ label, category, onRemove }: FilterPillProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pr-1 pl-2.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 ring-inset dark:bg-indigo-900/30 dark:text-indigo-300 dark:ring-indigo-800">
      <span className="text-indigo-400 dark:text-indigo-500">{category}:</span>
      <span className="max-w-32 truncate">{label}</span>
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-indigo-200 hover:text-indigo-900 dark:hover:bg-indigo-800 dark:hover:text-indigo-100"
      >
        <XMarkIcon className="h-3 w-3" />
      </button>
    </span>
  )
}
