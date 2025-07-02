'use client'

import { ProposalExisting, statuses } from '@/lib/proposal/types'
import { Speaker } from '@/lib/speaker/types'
import { sanityImage } from '@/lib/sanity/client'
import { UserIcon } from '@heroicons/react/24/outline'

interface SearchResultsProps {
  results: ProposalExisting[]
  isSearching: boolean
  error: string | null
  onSelect: (proposalId: string) => void
  onClose: () => void
}

export function SearchResults({
  results,
  isSearching,
  error,
  onSelect,
  onClose,
}: SearchResultsProps) {
  return (
    <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-96 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
      <div className="p-2">
        {isSearching && (
          <div className="flex items-center justify-center p-4 text-gray-500">
            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-gray-500"></div>
            Searching...
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

        {!isSearching && !error && results.length > 0 && (
          <>
            <div className="border-b px-3 py-2 text-xs text-gray-500">
              {results.length} proposal{results.length !== 1 ? 's' : ''} found
            </div>
            {results.map((proposal) => {
              const speaker = proposal.speaker as Speaker

              return (
                <button
                  key={proposal._id}
                  onClick={() => {
                    onSelect(proposal._id)
                    onClose()
                  }}
                  className="w-full border-b border-gray-100 p-3 text-left last:border-b-0 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                >
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      {speaker?.image ? (
                        <img
                          src={sanityImage(speaker.image)
                            .width(64)
                            .height(64)
                            .fit('crop')
                            .url()}
                          alt={speaker.name || 'Speaker'}
                          width={32}
                          height={32}
                          className="h-8 w-8 rounded-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                          <UserIcon className="h-4 w-4 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {proposal.title}
                          </p>
                          <p className="text-xs text-gray-500">
                            by {speaker?.name || 'Unknown Speaker'}
                          </p>
                        </div>
                        <span className="ml-2 inline-flex flex-shrink-0 items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">
                          {statuses.get(proposal.status) || proposal.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
