'use client'

import { ProposalExisting } from '@/lib/proposal/types'
import { LevelIndicator } from '@/lib/proposal'
import { Level } from '@/lib/proposal/types'
import { DraggableProposal } from './DraggableProposal'
import { useBatchUpdates } from '@/lib/schedule/performance-utils'
import {
  FunnelIcon,
  XMarkIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline'
import { SearchInput } from '@/components/SearchInput'
import { FilterSelect } from '@/components/FilterSelect'
import { useState, useMemo, useCallback } from 'react'

interface UnassignedProposalsProps {
  proposals: ProposalExisting[]
}

const VIRTUAL_SCROLL_THRESHOLD = 50
const PROPOSAL_HEIGHT = 120

const FILTER_STYLES = {
  container: 'space-y-3',
  clearButton:
    'absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-white/90 backdrop-blur-sm px-2 py-1 text-xs font-medium text-gray-600 hover:bg-white hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-all shadow-sm border border-gray-200 dark:bg-gray-800/90 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 dark:border-gray-600',
} as const

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

const EmptyState = ({ hasProposals }: { hasProposals: boolean }) => (
  <div className="flex h-full items-center justify-center p-8 text-center">
    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
      {hasProposals ? 'No matches found' : 'No talks available'}
    </h3>
    <p className="text-sm text-gray-500 dark:text-gray-400">
      {hasProposals
        ? 'Try adjusting your search or filter criteria'
        : 'No confirmed proposals are available for scheduling'}
    </p>
  </div>
)

export function UnassignedProposals({ proposals }: UnassignedProposalsProps) {
  const { batchUpdate } = useBatchUpdates()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFormat, setSelectedFormat] = useState<string>('')
  const [selectedLevel, setSelectedLevel] = useState<string>('')

  const filterOptions = useMemo(() => {
    const formats = new Set(proposals.map((p) => p.format).filter(Boolean))
    const levels = new Set(proposals.map((p) => p.level).filter(Boolean))

    return {
      formats: Array.from(formats).sort(),
      levels: Array.from(levels).sort(),
    }
  }, [proposals])

  const filteredProposals = useMemo(() => {
    if (!searchQuery && !selectedFormat && !selectedLevel) {
      return proposals
    }

    return proposals.filter((proposal) => {
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

      if (selectedFormat && proposal.format !== selectedFormat) {
        return false
      }

      if (selectedLevel && proposal.level !== selectedLevel) {
        return false
      }

      return true
    })
  }, [proposals, searchQuery, selectedFormat, selectedLevel])

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

  const hasActiveFilters = useMemo(() => {
    return Boolean(searchQuery || selectedFormat || selectedLevel)
  }, [searchQuery, selectedFormat, selectedLevel])

  const statsText = useMemo(() => {
    if (filteredProposals.length === proposals.length) {
      return `${proposals.length} ${proposals.length === 1 ? 'talk' : 'talks'}`
    }
    return `${filteredProposals.length} of ${proposals.length} talks`
  }, [filteredProposals.length, proposals.length])

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
      className="sticky flex h-full w-80 flex-col bg-white shadow-sm dark:bg-gray-900"
      style={{ top: '80px' }}
    >
      <div className="relative border-b border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Unassigned Talks
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {statsText}
          </p>
        </div>

        <ClearFiltersButton
          onClear={handleClearFilters}
          hasActiveFilters={hasActiveFilters}
        />

        <div className={FILTER_STYLES.container}>
          <SearchInput
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search talks or speakers..."
            inputClassName="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-500 focus:border-transparent focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400 dark:focus:bg-gray-600"
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
          <EmptyState hasProposals={proposals.length > 0} />
        )}
      </div>

      <div className="border-t border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
        <h3 className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">
          Legend
        </h3>
        <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Status:
            </span>
            <div className="h-3 w-3 rounded border-2 border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/50"></div>
            <span>Accepted</span>
            <div className="h-3 w-3 rounded border border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800"></div>
            <span>Confirmed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Level:
            </span>
            <LevelIndicator level={Level.beginner} size="xs" />
            <span>Beginner</span>
            <LevelIndicator level={Level.intermediate} size="xs" />
            <span>Intermediate</span>
            <LevelIndicator level={Level.advanced} size="xs" />
            <span>Advanced</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Topics:
            </span>
            <div className="h-3 w-3 rounded-sm bg-blue-500"></div>
            <span>Square indicators</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Border:
            </span>
            <div className="h-3 w-4 border-l-4 border-blue-500"></div>
            <span>Single topic</span>
            <div className="h-3 w-4 border-l-4 border-orange-500"></div>
            <span>Multiple topics</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Audience:
            </span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700 dark:text-gray-300">
              DEV +1
            </span>
            <span>Primary + count</span>
          </div>
        </div>
      </div>
    </div>
  )
}
