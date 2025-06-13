'use client'

import { DocumentTextIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { ProposalExisting, Status, Format } from '@/lib/proposal/types'
import { ProposalCard } from './ProposalCard'
import { ProposalsFilter, FilterState, ReviewStatus } from './ProposalsFilter'
import { useProposalFiltering, useFilterStateWithURL } from './hooks'

interface ProposalsListProps {
  proposals: ProposalExisting[]
  onProposalSelect?: (proposalId: string | null) => void
  selectedProposalId?: string | null
  enablePreview?: boolean
  currentUserId?: string
  allowedFormats?: Format[]
}

/**
 * Main proposals list component with filtering and sorting
 * Combines all admin proposal management functionality
 */
export function ProposalsList({
  proposals,
  onProposalSelect,
  selectedProposalId,
  enablePreview = false,
  currentUserId,
  allowedFormats
}: ProposalsListProps) {
  const initialFilters: FilterState = {
    status: [Status.submitted, Status.accepted, Status.confirmed],
    format: [],
    level: [],
    language: [],
    audience: [],
    reviewStatus: ReviewStatus.all,
    sortBy: 'created',
    sortOrder: 'desc'
  }

  const {
    filters,
    toggleFilter,
    setReviewStatus,
    setSortBy,
    toggleSortOrder,
    clearAllFilters,
    activeFilterCount
  } = useFilterStateWithURL(initialFilters)

  const filteredProposals = useProposalFiltering(proposals, filters, currentUserId)

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="border-b border-gray-200 pb-5">
        <div className="flex items-center gap-3">
          <DocumentTextIcon className="h-8 w-8 text-gray-400" />
          <div>
            <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              Proposal Management
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Review and manage all conference proposals ({filteredProposals.length} of {proposals.length} total)
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Sort Bar */}
      <div className="mt-6">
        <ProposalsFilter
          filters={filters}
          onFilterChange={toggleFilter}
          onReviewStatusChange={setReviewStatus}
          onSortChange={setSortBy}
          onSortOrderToggle={toggleSortOrder}
          onClearAll={clearAllFilters}
          activeFilterCount={activeFilterCount}
          currentUserId={currentUserId}
          allowedFormats={allowedFormats}
        />
      </div>

      {/* Proposals Grid */}
      <div className="mt-8">
        {filteredProposals.length === 0 ? (
          <EmptyState
            hasProposals={proposals.length > 0}
            onClearFilters={clearAllFilters}
          />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProposals.map((proposal) => (
              <ProposalCard
                key={proposal._id}
                proposal={proposal}
                href={`/admin/proposals/${proposal._id}`}
                onSelect={enablePreview && onProposalSelect ? () => onProposalSelect(proposal._id) : undefined}
                isSelected={selectedProposalId === proposal._id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {filteredProposals.length > 0 && (
        <div className="mt-8 text-center">
          <Link
            href="/admin"
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Back to Dashboard
          </Link>
        </div>
      )}
    </div>
  )
}

interface EmptyStateProps {
  hasProposals: boolean
  onClearFilters: () => void
}

/**
 * Empty state component for when no proposals match filters
 */
function EmptyState({ hasProposals, onClearFilters }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
      <h3 className="mt-2 text-sm font-semibold text-gray-900">
        {hasProposals ? 'No proposals match your filters' : 'No proposals'}
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        {hasProposals
          ? 'Try adjusting your filters to see more results.'
          : 'Get started by promoting the CFP.'
        }
      </p>
      <div className="mt-6">
        {hasProposals ? (
          <button
            onClick={onClearFilters}
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Clear All Filters
          </button>
        ) : (
          <Link
            href="/cfp"
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            View CFP Page
          </Link>
        )}
      </div>
    </div>
  )
}
