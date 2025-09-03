'use client'

import { useEffect, useRef } from 'react'
import { ProposalExisting, statuses, Format } from '@/lib/proposal/types'
import { SpeakerAvatars } from '../SpeakerAvatars'
import { UserIcon } from '@heroicons/react/24/outline'
import { getStatusBadgeStyle } from './utils'
import { SkeletonList } from './LoadingSkeleton'

interface SearchResultsProps {
  results: ProposalExisting[]
  isSearching: boolean
  error: string | null
  selectedIndex: number
  onSelect: (proposalId: string) => void
  onClose: () => void
}

export function SearchResults({
  results,
  isSearching,
  error,
  selectedIndex,
  onSelect,
  onClose,
}: SearchResultsProps) {
  const selectedRef = useRef<HTMLButtonElement>(null)

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && selectedRef.current) {
      selectedRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }
  }, [selectedIndex])
  return (
    <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-96 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
      <div className="p-2">
        {isSearching && (
          <div className="p-4">
            <SkeletonList items={4} itemHeight="h-16" />
          </div>
        )}

        {error && !isSearching && (
          <div className="p-4 text-center text-red-600">{error}</div>
        )}

        {!isSearching && !error && results.length === 0 && (
          <div className="p-4 text-center text-gray-500">
            No proposals found
          </div>
        )}

        {!isSearching &&
          !error &&
          results.length > 0 &&
          (() => {
            const talks = results.filter(
              (p) =>
                p.format !== Format.workshop_120 &&
                p.format !== Format.workshop_240,
            )
            const workshops = results.filter(
              (p) =>
                p.format === Format.workshop_120 ||
                p.format === Format.workshop_240,
            )

            const renderProposalGroup = (
              proposals: ProposalExisting[],
              startIndex: number,
            ) => {
              return proposals.map((proposal, index) => {
                const globalIndex = startIndex + index
                const speakers =
                  proposal.speakers && Array.isArray(proposal.speakers)
                    ? proposal.speakers.filter(
                        (speaker) =>
                          typeof speaker === 'object' &&
                          speaker &&
                          'name' in speaker,
                      )
                    : []
                const isSelected = globalIndex === selectedIndex

                return (
                  <button
                    key={proposal._id}
                    ref={isSelected ? selectedRef : null}
                    onClick={() => {
                      onSelect(proposal._id)
                      onClose()
                    }}
                    className={`w-full border-b border-gray-100 p-3 text-left last:border-b-0 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none ${
                      isSelected ? 'bg-blue-50 ring-1 ring-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center">
                      {proposal.speakers &&
                      Array.isArray(proposal.speakers) &&
                      proposal.speakers.length > 0 ? (
                        <SpeakerAvatars
                          speakers={proposal.speakers}
                          size="sm"
                          maxVisible={1}
                        />
                      ) : (
                        <div className="flex size-6 flex-none items-center justify-center rounded-full bg-gray-200">
                          <UserIcon className="size-4 text-gray-400" />
                        </div>
                      )}
                      <div className="ml-3 flex-auto truncate">
                        <div className="font-medium">{proposal.title}</div>
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-gray-500">
                            by{' '}
                            {speakers.map((s) => s.name).join(', ') ||
                              'Unknown Speaker'}
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusBadgeStyle(proposal.status)}`}
                          >
                            {statuses.get(proposal.status) || proposal.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })
            }

            return (
              <>
                <div className="border-b px-3 py-2 text-xs text-gray-500">
                  {results.length} proposal{results.length !== 1 ? 's' : ''}{' '}
                  found
                </div>
                {talks.length > 0 && (
                  <>
                    <div className="bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                      Talks ({talks.length})
                    </div>
                    {renderProposalGroup(talks, 0)}
                  </>
                )}
                {workshops.length > 0 && (
                  <>
                    <div className="bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                      Workshops ({workshops.length})
                    </div>
                    {renderProposalGroup(workshops, talks.length)}
                  </>
                )}
              </>
            )
          })()}
      </div>
    </div>
  )
}
