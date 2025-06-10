'use client'

import { useState, useMemo } from 'react'
import { FunnelIcon, ChevronDownIcon } from '@heroicons/react/20/solid'
import { DocumentTextIcon, UserIcon, ClockIcon } from '@heroicons/react/24/outline'
import { Menu, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ProposalExisting, statuses, formats, levels, languages, audiences, Status, Format, Level, Language, Audience } from '@/lib/proposal/types'

function getStatusBadgeStyle(status: Status) {
  switch (status) {
    case Status.accepted:
      return 'bg-green-100 text-green-800'
    case Status.rejected:
      return 'bg-red-100 text-red-800'
    case Status.confirmed:
      return 'bg-blue-100 text-blue-800'
    case Status.submitted:
      return 'bg-yellow-100 text-yellow-800'
    case Status.draft:
      return 'bg-gray-100 text-gray-800'
    case Status.withdrawn:
      return 'bg-orange-100 text-orange-800'
    case Status.deleted:
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

interface FilterState {
  status: Status[]
  format: Format[]
  level: Level[]
  language: Language[]
  audience: Audience[]
  sortBy: 'title' | 'status' | 'created' | 'speaker'
  sortOrder: 'asc' | 'desc'
}

export function ProposalsListClient({ proposals }: { proposals: ProposalExisting[] }) {
  const [filters, setFilters] = useState<FilterState>({
    status: [],
    format: [],
    level: [],
    language: [],
    audience: [],
    sortBy: 'created',
    sortOrder: 'desc'
  })

  const filteredAndSortedProposals = useMemo(() => {
    const filtered = proposals.filter(proposal => {
      // Filter by status
      if (filters.status.length > 0 && !filters.status.includes(proposal.status)) {
        return false
      }
      
      // Filter by format
      if (filters.format.length > 0 && !filters.format.includes(proposal.format)) {
        return false
      }
      
      // Filter by level
      if (filters.level.length > 0 && !filters.level.includes(proposal.level)) {
        return false
      }
      
      // Filter by language
      if (filters.language.length > 0 && !filters.language.includes(proposal.language)) {
        return false
      }
      
      // Filter by audience
      if (filters.audience.length > 0) {
        const hasMatchingAudience = proposal.audiences?.some(aud => filters.audience.includes(aud))
        if (!hasMatchingAudience) {
          return false
        }
      }
      
      return true
    })

    // Sort proposals
    filtered.sort((a, b) => {
      let aValue: string | number
      let bValue: string | number
      
      switch (filters.sortBy) {
        case 'title':
          aValue = a.title.toLowerCase()
          bValue = b.title.toLowerCase()
          break
        case 'status':
          aValue = a.status
          bValue = b.status
          break
        case 'speaker':
          aValue = (typeof a.speaker === 'object' && a.speaker && 'name' in a.speaker ? a.speaker.name : 'Unknown').toLowerCase()
          bValue = (typeof b.speaker === 'object' && b.speaker && 'name' in b.speaker ? b.speaker.name : 'Unknown').toLowerCase()
          break
        case 'created':
        default:
          aValue = new Date(a._createdAt).getTime()
          bValue = new Date(b._createdAt).getTime()
          break
      }
      
      if (filters.sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
      }
    })

    return filtered
  }, [proposals, filters])

  const toggleFilter = (filterType: keyof FilterState, value: Status | Format | Level | Language | Audience) => {
    setFilters(prev => {
      const currentValues = prev[filterType] as (Status | Format | Level | Language | Audience)[]
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value]
      
      return {
        ...prev,
        [filterType]: newValues
      }
    })
  }

  const clearAllFilters = () => {
    setFilters({
      status: [],
      format: [],
      level: [],
      language: [],
      audience: [],
      sortBy: 'created',
      sortOrder: 'desc'
    })
  }

  const activeFilterCount = filters.status.length + filters.format.length + filters.level.length + filters.language.length + filters.audience.length

  return (
    <div className="px-4 py-10 sm:px-6 lg:px-8 lg:py-6">
      <div className="mx-auto max-w-7xl">
        <div className="border-b border-gray-200 pb-5">
          <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Proposal Management
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Review and manage all conference proposals ({filteredAndSortedProposals.length} of {proposals.length} total)
          </p>
        </div>

        {/* Filter and Sort Bar */}
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2">
                <FunnelIcon className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Filters:</span>
              </div>

              {/* Status Filter */}
              <Menu as="div" className="relative">
                <Menu.Button className="inline-flex items-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
                  Status
                  {filters.status.length > 0 && (
                    <span className="ml-1 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                      {filters.status.length}
                    </span>
                  )}
                  <ChevronDownIcon className="-mr-1 h-5 w-5 text-gray-400" />
                </Menu.Button>
                <Transition as={Fragment} enter="transition ease-out duration-100" enterFrom="transform opacity-0 scale-95" enterTo="transform opacity-100 scale-100" leave="transition ease-in duration-75" leaveFrom="transform opacity-100 scale-100" leaveTo="transform opacity-0 scale-95">
                  <Menu.Items className="absolute left-0 z-10 mt-2 w-56 origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="py-1">
                      {Object.values(Status).map((status) => (
                        <Menu.Item key={status}>
                          {({ active }) => (
                            <button
                              onClick={() => toggleFilter('status', status)}
                              className={classNames(
                                active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                                'group flex w-full items-center px-4 py-2 text-sm'
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={filters.status.includes(status)}
                                onChange={() => {}}
                                className="mr-3 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                              />
                              <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadgeStyle(status)}`}>
                                {statuses.get(status)}
                              </span>
                            </button>
                          )}
                        </Menu.Item>
                      ))}
                    </div>
                  </Menu.Items>
                </Transition>
              </Menu>

              {/* Format Filter */}
              <Menu as="div" className="relative">
                <Menu.Button className="inline-flex items-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
                  Format
                  {filters.format.length > 0 && (
                    <span className="ml-1 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                      {filters.format.length}
                    </span>
                  )}
                  <ChevronDownIcon className="-mr-1 h-5 w-5 text-gray-400" />
                </Menu.Button>
                <Transition as={Fragment} enter="transition ease-out duration-100" enterFrom="transform opacity-0 scale-95" enterTo="transform opacity-100 scale-100" leave="transition ease-in duration-75" leaveFrom="transform opacity-100 scale-100" leaveTo="transform opacity-0 scale-95">
                  <Menu.Items className="absolute left-0 z-10 mt-2 w-64 origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="py-1">
                      {Object.values(Format).map((format) => (
                        <Menu.Item key={format}>
                          {({ active }) => (
                            <button
                              onClick={() => toggleFilter('format', format)}
                              className={classNames(
                                active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                                'group flex w-full items-center px-4 py-2 text-sm'
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={filters.format.includes(format)}
                                onChange={() => {}}
                                className="mr-3 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                              />
                              {formats.get(format)}
                            </button>
                          )}
                        </Menu.Item>
                      ))}
                    </div>
                  </Menu.Items>
                </Transition>
              </Menu>

              {/* Level Filter */}
              <Menu as="div" className="relative">
                <Menu.Button className="inline-flex items-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
                  Level
                  {filters.level.length > 0 && (
                    <span className="ml-1 inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                      {filters.level.length}
                    </span>
                  )}
                  <ChevronDownIcon className="-mr-1 h-5 w-5 text-gray-400" />
                </Menu.Button>
                <Transition as={Fragment} enter="transition ease-out duration-100" enterFrom="transform opacity-0 scale-95" enterTo="transform opacity-100 scale-100" leave="transition ease-in duration-75" leaveFrom="transform opacity-100 scale-100" leaveTo="transform opacity-0 scale-95">
                  <Menu.Items className="absolute left-0 z-10 mt-2 w-48 origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="py-1">
                      {Object.values(Level).map((level) => (
                        <Menu.Item key={level}>
                          {({ active }) => (
                            <button
                              onClick={() => toggleFilter('level', level)}
                              className={classNames(
                                active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                                'group flex w-full items-center px-4 py-2 text-sm'
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={filters.level.includes(level)}
                                onChange={() => {}}
                                className="mr-3 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                              />
                              {levels.get(level)}
                            </button>
                          )}
                        </Menu.Item>
                      ))}
                    </div>
                  </Menu.Items>
                </Transition>
              </Menu>
            </div>

            <div className="flex items-center gap-3">
              {/* Sort */}
              <Menu as="div" className="relative">
                <Menu.Button className="inline-flex items-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
                  Sort: {filters.sortBy === 'created' ? 'Date' : filters.sortBy === 'speaker' ? 'Speaker' : filters.sortBy}
                  <ChevronDownIcon className="-mr-1 h-5 w-5 text-gray-400" />
                </Menu.Button>
                <Transition as={Fragment} enter="transition ease-out duration-100" enterFrom="transform opacity-0 scale-95" enterTo="transform opacity-100 scale-100" leave="transition ease-in duration-75" leaveFrom="transform opacity-100 scale-100" leaveTo="transform opacity-0 scale-95">
                  <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="py-1">
                      {[
                        { key: 'created', label: 'Date Created' },
                        { key: 'title', label: 'Title' },
                        { key: 'speaker', label: 'Speaker' },
                        { key: 'status', label: 'Status' }
                      ].map((option) => (
                        <Menu.Item key={option.key}>
                          {({ active }) => (                          <button
                            onClick={() => setFilters(prev => ({ ...prev, sortBy: option.key as 'title' | 'status' | 'created' | 'speaker' }))}
                            className={classNames(
                                active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                                'group flex w-full items-center px-4 py-2 text-sm'
                              )}
                            >
                              {option.label}
                            </button>
                          )}
                        </Menu.Item>
                      ))}
                      <hr className="my-1" />
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={() => setFilters(prev => ({ ...prev, sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc' }))}
                            className={classNames(
                              active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                              'group flex w-full items-center px-4 py-2 text-sm'
                            )}
                          >
                            {filters.sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
                          </button>
                        )}
                      </Menu.Item>
                    </div>
                  </Menu.Items>
                </Transition>
              </Menu>

              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                  Clear all ({activeFilterCount})
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8">
          {filteredAndSortedProposals.length === 0 ? (
            <div className="text-center py-12">
              <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">
                {proposals.length === 0 ? 'No proposals' : 'No proposals match your filters'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {proposals.length === 0 
                  ? 'Get started by promoting the CFP.' 
                  : 'Try adjusting your filters to see more results.'
                }
              </p>
              <div className="mt-6">
                {proposals.length === 0 ? (
                  <Link
                    href="/cfp"
                    className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                  >
                    View CFP Page
                  </Link>
                ) : (
                  <button
                    onClick={clearAllFilters}
                    className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
                  >
                    Clear All Filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAndSortedProposals.map((proposal) => {
                const speaker = typeof proposal.speaker === 'object' && proposal.speaker && 'name' in proposal.speaker
                  ? proposal.speaker
                  : null;

                return (
                  <Link
                    key={proposal._id}
                    href={`/admin/proposals/${proposal._id}`}
                    className="relative rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-gray-400 hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        {speaker?.image ? (
                          <Image
                            src={speaker.image}
                            alt={speaker.name || 'Speaker'}
                            width={48}
                            height={48}
                            className="h-12 w-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                            <UserIcon className="h-6 w-6 text-gray-400" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="focus:outline-none">
                          <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-2">
                            {proposal.title}
                          </p>
                          <div className="space-y-2">
                            <div className="flex items-center text-sm text-gray-600">
                              <span className="font-medium truncate">
                                {speaker?.name || 'Unknown Speaker'}
                              </span>
                            </div>
                            <div className="flex items-center text-sm text-gray-500">
                              <ClockIcon className="mr-1 h-4 w-4 flex-shrink-0" />
                              <span className="truncate">
                                {formats.get(proposal.format) || proposal.format || 'Not specified'}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {levels.get(proposal.level) || proposal.level || 'Level not specified'} • {languages.get(proposal.language) || proposal.language || 'Language not specified'}
                            </div>
                            {proposal.audiences && proposal.audiences.length > 0 && (
                              <div className="text-xs text-gray-500">
                                Audience: {proposal.audiences.map(aud => audiences.get(aud) || aud).join(', ')}
                              </div>
                            )}
                          </div>
                          <div className="mt-3">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeStyle(proposal.status)}`}>
                              {statuses.get(proposal.status) || proposal.status || 'Unknown'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Link to the detailed proposal management */}
        {filteredAndSortedProposals.length > 0 && (
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
    </div>
  )
}
