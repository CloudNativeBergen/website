'use client'

import { DocumentTextIcon, PlusIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { ProposalExisting, Status, Format } from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'
import { ProposalCard } from './ProposalCard'
import { ProposalsFilter, FilterState, ReviewStatus } from './ProposalsFilter'
import { ProposalStatistics } from './ProposalStatistics'
import { useProposalFiltering, useFilterStateWithURL } from './hooks'

interface ProposalsListProps {
  proposals: ProposalExisting[]
  onProposalSelect?: (proposalId: string | null) => void
  selectedProposalId?: string | null
  enablePreview?: boolean
  currentUserId?: string
  allowedFormats?: Format[]
  onCreateProposal?: () => void
  conference?: Conference
}

export function ProposalsList({
  proposals,
  onProposalSelect,
  selectedProposalId,
  enablePreview = false,
  currentUserId,
  allowedFormats,
  onCreateProposal,
}: ProposalsListProps) {
  const initialFilters: FilterState = {
    status: [Status.submitted, Status.accepted, Status.confirmed],
    format: [],
    level: [],
    language: [],
    audience: [],
    speakerFlags: [],
    reviewStatus: ReviewStatus.all,
    hideMultipleTalks: false,
    sortBy: 'created',
    sortOrder: 'desc',
  }

  const {
    filters,
    toggleFilter,
    setReviewStatus,
    setHideMultipleTalks,
    setSortBy,
    toggleSortOrder,
    clearAllFilters,
    activeFilterCount,
  } = useFilterStateWithURL(initialFilters)

  const filteredProposals = useProposalFiltering(
    proposals,
    filters,
    currentUserId,
  )

  return (
    <div className="mx-auto max-w-7xl">
      <div className="border-b border-gray-200 pb-5 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DocumentTextIcon className="h-8 w-8 text-gray-400 dark:text-gray-500" />
            <div>
              <h1 className="text-2xl leading-7 font-bold text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight dark:text-white">
                Proposal Management
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Review and manage all conference proposals (
                {filteredProposals.length} of {proposals.length} total)
              </p>
            </div>
          </div>
          {onCreateProposal && (
            <button
              onClick={onCreateProposal}
              className="font-space-grotesk inline-flex items-center gap-2 rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-cloud-blue/90 focus:outline-2 focus:outline-offset-2 focus:outline-brand-cloud-blue dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus:outline-blue-500"
              aria-label="Create new proposal"
            >
              <PlusIcon className="h-5 w-5" />
              New Proposal
            </button>
          )}
        </div>
      </div>

      <div className="mt-6">
        <ProposalsFilter
          filters={filters}
          onFilterChange={toggleFilter}
          onReviewStatusChange={setReviewStatus}
          onMultipleTalksFilterChange={setHideMultipleTalks}
          onSortChange={setSortBy}
          onSortOrderToggle={toggleSortOrder}
          onClearAll={clearAllFilters}
          activeFilterCount={activeFilterCount}
          currentUserId={currentUserId}
          allowedFormats={allowedFormats}
        />
      </div>

      <div className="mt-6">
        <ProposalStatistics proposals={filteredProposals} />
      </div>

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
                onSelect={
                  enablePreview && onProposalSelect
                    ? () => onProposalSelect(proposal._id)
                    : undefined
                }
                isSelected={selectedProposalId === proposal._id}
              />
            ))}
          </div>
        )}
      </div>

      {filteredProposals.length > 0 && (
        <div className="mt-8 text-center">
          <Link
            href="/admin"
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600"
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

function EmptyState({ hasProposals, onClearFilters }: EmptyStateProps) {
  return (
    <div className="py-12 text-center">
      <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
      <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
        {hasProposals ? 'No proposals match your filters' : 'No proposals'}
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {hasProposals
          ? 'Try adjusting your filters to see more results.'
          : 'Get started by promoting the CFP.'}
      </p>
      <div className="mt-6">
        {hasProposals ? (
          <button
            onClick={onClearFilters}
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            Clear All Filters
          </button>
        ) : (
          <Link
            href="/cfp"
            className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            View CFP Page
          </Link>
        )}
      </div>
    </div>
  )
}
