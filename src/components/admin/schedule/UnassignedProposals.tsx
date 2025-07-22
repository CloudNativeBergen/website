'use client'

import { ProposalExisting } from '@/lib/proposal/types'
import { LevelIndicator } from '@/lib/proposal/level-indicator'
import { Level } from '@/lib/proposal/types'
import { DraggableProposal } from './DraggableProposal'
import { useBatchUpdates } from '@/lib/schedule/performance-utils'
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline'
import { useState, useMemo, useCallback } from 'react'

interface UnassignedProposalsProps {
  proposals: ProposalExisting[]
}

// Constants for better performance
const VIRTUAL_SCROLL_THRESHOLD = 50 // Enable virtualization for large lists
const PROPOSAL_HEIGHT = 120 // Estimated height per proposal in pixels

// Constants for better maintainability
const FILTER_STYLES = {
  container: 'space-y-3',
  searchContainer: 'relative',
  searchIcon:
    'absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none',
  searchInput:
    'w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-500 focus:border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all',
  filterRow: 'flex items-center gap-2',
  filterIcon: 'h-4 w-4 text-gray-500 flex-shrink-0',
  select:
    'flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all cursor-pointer',
  clearButton:
    'absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-white/90 backdrop-blur-sm px-2 py-1 text-xs font-medium text-gray-600 hover:bg-white hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-all shadow-sm border border-gray-200',
} as const

// Memoized filter components
const SearchFilter = ({
  searchQuery,
  onSearchChange,
}: {
  searchQuery: string
  onSearchChange: (value: string) => void
}) => (
  <div className={FILTER_STYLES.searchContainer}>
    <MagnifyingGlassIcon className={FILTER_STYLES.searchIcon} />
    <input
      type="text"
      placeholder="Search talks or speakers..."
      value={searchQuery}
      onChange={(e) => onSearchChange(e.target.value)}
      className={FILTER_STYLES.searchInput}
    />
  </div>
)

const FormatFilter = ({
  selectedFormat,
  availableFormats,
  onFormatChange,
}: {
  selectedFormat: string
  availableFormats: string[]
  onFormatChange: (value: string) => void
}) => (
  <div className={FILTER_STYLES.filterRow}>
    <FunnelIcon className={FILTER_STYLES.filterIcon} />
    <select
      value={selectedFormat}
      onChange={(e) => onFormatChange(e.target.value)}
      className={FILTER_STYLES.select}
    >
      <option value="">All formats</option>
      {availableFormats.map((format) => (
        <option key={format} value={format}>
          {format.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
        </option>
      ))}
    </select>
  </div>
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
  <div className={FILTER_STYLES.filterRow}>
    <AdjustmentsHorizontalIcon className={FILTER_STYLES.filterIcon} />
    <select
      value={selectedLevel}
      onChange={(e) => onLevelChange(e.target.value)}
      className={FILTER_STYLES.select}
    >
      <option value="">All levels</option>
      {availableLevels.map((level) => (
        <option key={level} value={level}>
          {level.charAt(0).toUpperCase() + level.slice(1)}
        </option>
      ))}
    </select>
  </div>
)

const ClearFiltersButton = ({
  onClear,
  hasActiveFilters,
}: {
  onClear: () => void
  hasActiveFilters: boolean
}) => {
  if (!hasActiveFilters) return null

  return (
    <button
      onClick={onClear}
      className={FILTER_STYLES.clearButton}
      type="button"
      title="Clear all filters"
    >
      <XMarkIcon className="h-3 w-3" />
      Clear
    </button>
  )
}

const EmptyState = ({
  hasProposals,
  hasActiveFilters,
}: {
  hasProposals: boolean
  hasActiveFilters: boolean
}) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
      {hasActiveFilters ? (
        <FunnelIcon className="h-6 w-6 text-gray-400" />
      ) : (
        <AdjustmentsHorizontalIcon className="h-6 w-6 text-gray-400" />
      )}
    </div>
    <h3 className="mb-2 text-sm font-medium text-gray-900">
      {hasProposals ? 'No matches found' : 'No talks available'}
    </h3>
    <p className="text-sm text-gray-500">
      {hasProposals
        ? 'Try adjusting your search or filter criteria'
        : 'No confirmed proposals are available for scheduling'}
    </p>
  </div>
)

export function UnassignedProposals({ proposals }: UnassignedProposalsProps) {
  // Performance optimization for rapid filter changes
  const { batchUpdate } = useBatchUpdates()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFormat, setSelectedFormat] = useState<string>('')
  const [selectedLevel, setSelectedLevel] = useState<string>('')

  // Memoized filter options for performance
  const filterOptions = useMemo(() => {
    const formats = new Set(proposals.map((p) => p.format).filter(Boolean))
    const levels = new Set(proposals.map((p) => p.level).filter(Boolean))

    return {
      formats: Array.from(formats).sort(),
      levels: Array.from(levels).sort(),
    }
  }, [proposals])

  // Optimized filtering with better search logic
  const filteredProposals = useMemo(() => {
    if (!searchQuery && !selectedFormat && !selectedLevel) {
      return proposals
    }

    return proposals.filter((proposal) => {
      // Search logic - check title, speaker name, and format
      if (searchQuery) {
        const query = searchQuery.toLowerCase().trim()
        const titleMatch = proposal.title.toLowerCase().includes(query)

        const speakerMatch =
          proposal.speakers &&
          Array.isArray(proposal.speakers) &&
          proposal.speakers.some(
            (speaker) =>
              typeof speaker === 'object' &&
              'name' in speaker &&
              speaker.name.toLowerCase().includes(query),
          )

        const formatMatch = proposal.format.toLowerCase().includes(query)

        if (!titleMatch && !speakerMatch && !formatMatch) {
          return false
        }
      }

      // Format filter
      if (selectedFormat && proposal.format !== selectedFormat) {
        return false
      }

      // Level filter
      if (selectedLevel && proposal.level !== selectedLevel) {
        return false
      }

      return true
    })
  }, [proposals, searchQuery, selectedFormat, selectedLevel])

  // Memoized event handlers for performance with batched updates
  const handleSearchChange = useCallback(
    (value: string) => {
      batchUpdate(() => setSearchQuery(value))
    },
    [batchUpdate],
  )

  const handleFormatChange = useCallback(
    (value: string) => {
      batchUpdate(() => setSelectedFormat(value))
    },
    [batchUpdate],
  )

  const handleLevelChange = useCallback(
    (value: string) => {
      batchUpdate(() => setSelectedLevel(value))
    },
    [batchUpdate],
  )

  const handleClearFilters = useCallback(() => {
    batchUpdate(() => {
      setSearchQuery('')
      setSelectedFormat('')
      setSelectedLevel('')
    })
  }, [batchUpdate])

  // Memoized computed values
  const hasActiveFilters = useMemo(() => {
    return Boolean(searchQuery || selectedFormat || selectedLevel)
  }, [searchQuery, selectedFormat, selectedLevel])

  const statsText = useMemo(() => {
    if (filteredProposals.length === proposals.length) {
      return `${proposals.length} ${proposals.length === 1 ? 'talk' : 'talks'}`
    }
    return `${filteredProposals.length} of ${proposals.length} talks`
  }, [filteredProposals.length, proposals.length])

  // Virtual scrolling for performance with large lists
  const useVirtualScrolling =
    filteredProposals.length > VIRTUAL_SCROLL_THRESHOLD
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(600)

  const virtualizedItems = useMemo(() => {
    if (!useVirtualScrolling)
      return filteredProposals.map((proposal, index) => ({
        proposal,
        index,
        offsetTop: 0,
      }))

    const startIndex = Math.floor(scrollTop / PROPOSAL_HEIGHT)
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / PROPOSAL_HEIGHT) + 2,
      filteredProposals.length,
    )

    return filteredProposals.slice(startIndex, endIndex).map((proposal, i) => ({
      proposal,
      index: startIndex + i,
      offsetTop: (startIndex + i) * PROPOSAL_HEIGHT,
    }))
  }, [filteredProposals, scrollTop, containerHeight, useVirtualScrolling])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  return (
    <div
      className="sticky flex h-full w-80 flex-col bg-white shadow-sm"
      style={{ top: '80px' }}
    >
      {/* Header */}
      <div className="relative border-b border-gray-200 bg-gray-50/50 p-4">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Unassigned Talks
          </h2>
          <p className="mt-1 text-sm text-gray-600">{statsText}</p>
        </div>

        {/* Clear filters button - positioned absolutely to prevent layout shift */}
        <ClearFiltersButton
          onClear={handleClearFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {/* Filters */}
        <div className={FILTER_STYLES.container}>
          <SearchFilter
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
          />

          <FormatFilter
            selectedFormat={selectedFormat}
            availableFormats={filterOptions.formats}
            onFormatChange={handleFormatChange}
          />

          <LevelFilter
            selectedLevel={selectedLevel}
            availableLevels={filterOptions.levels}
            onLevelChange={handleLevelChange}
          />
        </div>
      </div>

      {/* Proposals list with virtual scrolling */}
      <div
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
        ref={(el) => {
          if (el && containerHeight !== el.clientHeight) {
            setContainerHeight(el.clientHeight)
          }
        }}
      >
        {filteredProposals.length > 0 ? (
          useVirtualScrolling ? (
            <div
              className="relative"
              style={{ height: filteredProposals.length * PROPOSAL_HEIGHT }}
            >
              {virtualizedItems.map(({ proposal, offsetTop }) => (
                <div
                  key={proposal._id}
                  className="absolute right-0 left-0 px-4 py-1"
                  style={{
                    top: offsetTop,
                    height: PROPOSAL_HEIGHT,
                  }}
                >
                  <div className="overflow-hidden">
                    <DraggableProposal proposal={proposal} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2 p-4">
              {virtualizedItems.map(({ proposal }) => (
                <div key={proposal._id} className="overflow-hidden">
                  <DraggableProposal proposal={proposal} />
                </div>
              ))}
            </div>
          )
        ) : (
          <EmptyState
            hasProposals={proposals.length > 0}
            hasActiveFilters={hasActiveFilters}
          />
        )}
      </div>

      {/* Legend */}
      <div className="border-t border-gray-200 bg-gray-50/50 p-3">
        <h3 className="mb-2 text-xs font-medium text-gray-700">Legend</h3>
        <div className="space-y-1.5 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700">Level:</span>
            <LevelIndicator level={Level.beginner} size="sm" />
            <span>Beginner</span>
            <LevelIndicator level={Level.intermediate} size="sm" />
            <span>Intermediate</span>
            <LevelIndicator level={Level.advanced} size="sm" />
            <span>Advanced</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700">Border:</span>
            <div className="h-2 w-3 border-l-4 border-blue-500"></div>
            <span>Topic colors</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700">Audience:</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
              DEV +2
            </span>
            <span>Primary + count</span>
          </div>
        </div>
      </div>
    </div>
  )
}
