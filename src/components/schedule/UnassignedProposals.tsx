'use client'

import { ProposalExisting } from '@/lib/proposal/types'
import { DraggableProposal } from './DraggableProposal'
import { MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline'
import { useState, useMemo } from 'react'

interface UnassignedProposalsProps {
  proposals: ProposalExisting[]
}

export function UnassignedProposals({ proposals }: UnassignedProposalsProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFormat, setSelectedFormat] = useState<string>('')
  const [selectedLevel, setSelectedLevel] = useState<string>('')

  const filteredProposals = useMemo(() => {
    return proposals.filter((proposal) => {
      const matchesSearch =
        !searchQuery ||
        proposal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (typeof proposal.speaker === 'object' &&
          'name' in proposal.speaker &&
          proposal.speaker.name
            .toLowerCase()
            .includes(searchQuery.toLowerCase()))

      const matchesFormat =
        !selectedFormat || proposal.format === selectedFormat
      const matchesLevel = !selectedLevel || proposal.level === selectedLevel

      return matchesSearch && matchesFormat && matchesLevel
    })
  }, [proposals, searchQuery, selectedFormat, selectedLevel])

  const availableFormats = useMemo(() => {
    const formats = new Set(proposals.map((p) => p.format))
    return Array.from(formats).sort()
  }, [proposals])

  const availableLevels = useMemo(() => {
    const levels = new Set(proposals.map((p) => p.level))
    return Array.from(levels).sort()
  }, [proposals])

  return (
    <div className="flex h-full w-80 flex-col overflow-x-hidden border-r border-gray-200 bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Unassigned Talks
        </h2>
        <div className="mb-3 text-sm text-gray-600">
          {filteredProposals.length} of {proposals.length} talks
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <MagnifyingGlassIcon className="absolute top-2.5 left-3 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search talks or speakers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-gray-300 py-2 pr-3 pl-9 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        {/* Filters */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FunnelIcon className="h-4 w-4 text-gray-400" />
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">All formats</option>
              {availableFormats.map((format) => (
                <option key={format} value={format}>
                  {format.replace('_', ' ').toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">All levels</option>
            {availableLevels.map((level) => (
              <option key={level} value={level}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Clear filters */}
        {(searchQuery || selectedFormat || selectedLevel) && (
          <button
            onClick={() => {
              setSearchQuery('')
              setSelectedFormat('')
              setSelectedLevel('')
            }}
            className="mt-2 text-xs text-blue-600 hover:text-blue-800"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Proposals list */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto p-4">
        <div className="max-w-full space-y-3">
          {filteredProposals.map((proposal) => (
            <div key={proposal._id} className="max-w-full overflow-hidden">
              <DraggableProposal proposal={proposal} />
            </div>
          ))}
        </div>

        {filteredProposals.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-500">
              {proposals.length === 0
                ? 'No confirmed proposals available'
                : 'No proposals match your filters'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
