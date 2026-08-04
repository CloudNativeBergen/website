'use client'

import type { ProposalFilterState } from './useProposalFilters'
import { AdminFilterBar, FilterGroup } from '@/components/admin/AdminFilterBar'

export function ProposalFilters({ filters }: { filters: ProposalFilterState }) {
  const groups: FilterGroup[] = []

  if (filters.availableFormats.length > 0) {
    groups.push({
      key: 'formats',
      label: 'Format',
      options: filters.availableFormats.map((f) => ({
        value: f,
        label: f.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      })),
      selected: filters.selectedFormats,
      onChange: (val) => {
        const next = filters.selectedFormats.includes(val)
          ? filters.selectedFormats.filter((v) => v !== val)
          : [...filters.selectedFormats, val]
        filters.setSelectedFormats(next)
      },
    })
  }

  if (filters.availableLevels.length > 0) {
    groups.push({
      key: 'levels',
      label: 'Level',
      options: filters.availableLevels.map((l) => ({
        value: l,
        label: l.charAt(0).toUpperCase() + l.slice(1),
      })),
      selected: filters.selectedLevels,
      onChange: (val) => {
        const next = filters.selectedLevels.includes(val)
          ? filters.selectedLevels.filter((v) => v !== val)
          : [...filters.selectedLevels, val]
        filters.setSelectedLevels(next)
      },
    })
  }

  if (filters.availableTopics.length > 0) {
    groups.push({
      key: 'topics',
      label: 'Topics',
      options: filters.availableTopics.map((t) => ({
        value: t,
        label: t,
      })),
      selected: filters.selectedTopics,
      onChange: (val) => {
        const next = filters.selectedTopics.includes(val)
          ? filters.selectedTopics.filter((v) => v !== val)
          : [...filters.selectedTopics, val]
        filters.setSelectedTopics(next)
      },
    })
  }

  // Partials are shown by DEFAULT (a split remainder must not disappear), so it
  // is HIDING them that counts as an active filter.
  const activeCount =
    filters.selectedFormats.length +
    filters.selectedLevels.length +
    filters.selectedTopics.length +
    (filters.showPartiallyScheduled ? 0 : 1)

  return (
    <AdminFilterBar
      search={{
        value: filters.searchQuery,
        onChange: filters.setSearchQuery,
        placeholder: 'Search talks...',
      }}
      filters={groups}
      onClearAll={filters.clearFilters}
      activeFilterCount={activeCount}
      resultCount={filters.filteredProposals.length}
      totalCount={filters.totalCount}
      resultLabel="talks"
      mobileFilterLabel="Filter"
      className="!p-2 shadow-sm"
      sheetExtra={
        <div className="mt-4 flex items-center space-x-2 border-t border-gray-100 px-1 pt-4 dark:border-gray-800">
          <input
            type="checkbox"
            id="showPartiallyScheduled"
            checked={filters.showPartiallyScheduled}
            onChange={(e) =>
              filters.setShowPartiallyScheduled(e.target.checked)
            }
            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label
            htmlFor="showPartiallyScheduled"
            className="text-base font-medium text-gray-700 dark:text-gray-300"
          >
            Show partially scheduled talks
          </label>
        </div>
      }
      desktopExtra={
        <div className="flex items-center space-x-1.5 px-2">
          <input
            type="checkbox"
            id="showPartiallyScheduledDesktop"
            checked={filters.showPartiallyScheduled}
            onChange={(e) =>
              filters.setShowPartiallyScheduled(e.target.checked)
            }
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label
            htmlFor="showPartiallyScheduledDesktop"
            className="cursor-pointer text-xs whitespace-nowrap text-gray-600 select-none dark:text-gray-400"
            title="Show partially scheduled talks (split sessions)"
          >
            Partials
          </label>
        </div>
      }
    />
  )
}
