'use client'

import { useMemo } from 'react'
import {
  DocumentTextIcon,
  PlusIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import Link from 'next/link'
import { ProposalExisting, Status, Format } from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'
import { ProposalCard } from './ProposalCard'
import { ProposalsFilter, FilterState, ReviewStatus } from './ProposalsFilter'
import { ProposalStatistics } from './ProposalStatistics'
import { useFilterStateWithURL } from './hooks'
import { AdminButton } from '@/components/admin/AdminButton'
import { api } from '@/lib/trpc/client'

interface ProposalsListProps {
  onProposalSelect?: (proposalId: string | null) => void
  selectedProposalId?: string | null
  enablePreview?: boolean
  currentUserId?: string
  allowedFormats?: Format[]
  onCreateProposal?: () => void
  conference?: Conference
  initialProposals?: ProposalExisting[]
}

import { useDebounce } from '@/hooks/useDebounce'

export function ProposalsList({
  onProposalSelect,
  selectedProposalId,
  enablePreview = false,
  currentUserId,
  allowedFormats,
  onCreateProposal,
  initialProposals = [],
}: ProposalsListProps) {
  const initialFilters = useMemo<FilterState>(
    () => ({
      status: [Status.submitted, Status.accepted, Status.confirmed],
      format: [],
      level: [],
      language: [],
      audience: [],
      speakerFlags: [],
      reviewStatus: ReviewStatus.all,
      hideMultipleTalks: false,
      searchQuery: '',
      sortBy: 'created',
      sortOrder: 'desc',
    }),
    [],
  )

  const {
    filters,
    toggleFilter,
    setReviewStatus,
    setSearchQuery,
    setHideMultipleTalks,
    setSortBy,
    toggleSortOrder,
    clearAllFilters,
    activeFilterCount,
  } = useFilterStateWithURL(initialFilters)

  const debouncedFilters = useDebounce(filters, 300)

  // Fetch proposals from API with filters
  const {
    data: filteredProposals,
    isLoading,
    error,
  } = api.proposal.admin.list.useQuery(debouncedFilters)

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
        <h3 className="text-sm font-medium">Failed to load proposals</h3>
        <p className="mt-1 text-xs">{error.message}</p>
      </div>
    )
  }

  const displayProposals = filteredProposals || initialProposals

  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<DocumentTextIcon />}
        title="Proposal Management"
        description={`Review and manage all conference proposals (${displayProposals.length} total)`}
        actionItems={
          onCreateProposal
            ? [
                {
                  label: 'New Proposal',
                  onClick: onCreateProposal,
                  icon: <PlusIcon className="h-4 w-4" />,
                },
              ]
            : undefined
        }
      />

      <div>
        <ProposalsFilter
          filters={filters}
          onFilterChange={toggleFilter}
          onReviewStatusChange={setReviewStatus}
          onSearchChange={setSearchQuery}
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
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <ArrowPathIcon className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <ProposalStatistics proposals={displayProposals} />
            <div className="mt-8">
              {displayProposals.length === 0 ? (
                <EmptyState
                  hasProposals={initialProposals.length > 0}
                  onClearFilters={clearAllFilters}
                />
              ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {displayProposals.map((proposal) => (
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
          </>
        )}
      </div>

      {displayProposals.length > 0 && (
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
          <AdminButton onClick={onClearFilters}>Clear All Filters</AdminButton>
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
