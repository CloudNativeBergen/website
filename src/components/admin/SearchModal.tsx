'use client'

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { useTheme } from 'next-themes'
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import {
  ExclamationTriangleIcon,
  DocumentTextIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import { useState, useEffect } from 'react'
import { SkeletonList } from './LoadingSkeleton'
import { useProposalSearch } from './hooks/useProposalSearch'
import { ProposalExisting, statuses, Format } from '@/lib/proposal/types'
import { SpeakerAvatars } from '../SpeakerAvatars'
import { getStatusBadgeStyle } from './utils'

interface SearchModalProps {
  open: boolean
  onClose: () => void
}

export function SearchModal({ open, onClose }: SearchModalProps) {
  const { theme } = useTheme()
  const [rawQuery, setRawQuery] = useState('')
  const {
    search,
    isSearching,
    searchResults,
    searchError,
    navigateToProposal,
    clearSearch,
  } = useProposalSearch()

  const query = rawQuery.toLowerCase().trim()

  // Handle search with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query) {
        search(query)
      } else {
        clearSearch()
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [query, search, clearSearch])

  const handleClose = () => {
    setRawQuery('')
    clearSearch()
    onClose()
  }

  const handleSelect = (proposal: ProposalExisting | null) => {
    if (!proposal || !proposal._id) {
      return
    }
    navigateToProposal(proposal._id)
    handleClose()
  }

  return (
    <Transition appear show={open}>
      <Dialog
        as="div"
        className={`relative z-10 ${theme === 'dark' ? 'dark' : ''}`}
        onClose={handleClose}
      >
        <TransitionChild
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-gray-500/25 dark:bg-gray-900/50" />
        </TransitionChild>

        <div className="fixed inset-0 z-10 w-screen overflow-y-auto p-4 sm:p-6 md:p-20">
          <TransitionChild
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <DialogPanel
              transition
              className="mx-auto max-w-xl transform divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5 transition-all data-closed:scale-95 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in dark:divide-gray-700 dark:bg-gray-900 dark:ring-gray-700"
            >
              <Combobox
                onChange={(proposal: ProposalExisting | null) => {
                  if (proposal && proposal._id) {
                    handleSelect(proposal)
                  }
                }}
              >
                <div className="grid grid-cols-1">
                  <ComboboxInput
                    autoFocus
                    className="col-start-1 row-start-1 h-12 w-full pr-4 pl-11 text-base text-gray-900 outline-hidden placeholder:text-gray-400 sm:text-sm dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500"
                    placeholder="Search proposals, speakers, topics..."
                    value={rawQuery}
                    onChange={(event) => setRawQuery(event.target.value)}
                  />
                  <MagnifyingGlassIcon
                    className="pointer-events-none col-start-1 row-start-1 ml-4 size-5 self-center text-gray-400 dark:text-gray-500"
                    aria-hidden="true"
                  />
                </div>

                {!isSearching &&
                  query &&
                  searchResults.length > 0 &&
                  (() => {
                    const talks = searchResults.filter(
                      (p) =>
                        p.format !== Format.workshop_120 &&
                        p.format !== Format.workshop_240,
                    )
                    const workshops = searchResults.filter(
                      (p) =>
                        p.format === Format.workshop_120 ||
                        p.format === Format.workshop_240,
                    )

                    const renderProposalOption = (
                      proposal: ProposalExisting,
                    ) => {
                      const speakers =
                        proposal.speakers && Array.isArray(proposal.speakers)
                          ? proposal.speakers.filter(
                              (speaker) =>
                                typeof speaker === 'object' &&
                                speaker &&
                                'name' in speaker,
                            )
                          : []
                      return (
                        <ComboboxOption
                          as="li"
                          key={proposal._id}
                          value={proposal}
                          className="group flex cursor-default items-center px-4 py-2 select-none data-focus:bg-indigo-600 data-focus:text-white data-focus:outline-hidden dark:data-focus:bg-indigo-500"
                        >
                          <div className="flex-shrink-0">
                            {proposal.speakers &&
                            Array.isArray(proposal.speakers) &&
                            proposal.speakers.length > 0 ? (
                              <SpeakerAvatars
                                speakers={proposal.speakers}
                                size="sm"
                                maxVisible={1}
                              />
                            ) : (
                              <div className="flex size-6 flex-none items-center justify-center rounded-full bg-gray-200 group-data-focus:bg-white/20 dark:bg-gray-700 dark:group-data-focus:bg-white/20">
                                <UserIcon className="size-4 text-gray-400 group-data-focus:text-white dark:text-gray-500" />
                              </div>
                            )}
                          </div>
                          <div className="ml-3 flex-auto truncate">
                            <div className="font-medium dark:text-white">
                              {proposal.title}
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="text-xs text-gray-500 group-data-focus:text-white/70 dark:text-gray-400">
                                by{' '}
                                {speakers.map((s) => s.name).join(', ') ||
                                  'Unknown Speaker'}
                              </div>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${getStatusBadgeStyle(proposal.status)}`}
                              >
                                {statuses.get(proposal.status) ||
                                  proposal.status}
                              </span>
                            </div>
                          </div>
                        </ComboboxOption>
                      )
                    }

                    return (
                      <ComboboxOptions
                        static
                        as="ul"
                        className="max-h-80 transform-gpu scroll-py-10 scroll-pb-2 space-y-4 overflow-y-auto p-4 pb-2"
                      >
                        {talks.length > 0 && (
                          <li>
                            <h2 className="text-xs font-semibold text-gray-900 dark:text-white">
                              Talks ({talks.length})
                            </h2>
                            <ul className="-mx-4 mt-2 text-sm text-gray-700 dark:text-gray-300">
                              {talks.map(renderProposalOption)}
                            </ul>
                          </li>
                        )}
                        {workshops.length > 0 && (
                          <li>
                            <h2 className="text-xs font-semibold text-gray-900 dark:text-white">
                              Workshops ({workshops.length})
                            </h2>
                            <ul className="-mx-4 mt-2 text-sm text-gray-700 dark:text-gray-300">
                              {workshops.map(renderProposalOption)}
                            </ul>
                          </li>
                        )}
                      </ComboboxOptions>
                    )
                  })()}

                {isSearching && (
                  <div className="px-6 py-6 sm:px-14">
                    <SkeletonList items={3} itemHeight="h-12" />
                    <div className="mt-4 text-center">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Searching proposals...
                      </p>
                    </div>
                  </div>
                )}

                {searchError && (
                  <div className="px-6 py-14 text-center text-sm sm:px-14">
                    <ExclamationTriangleIcon
                      className="mx-auto size-6 text-red-400"
                      aria-hidden="true"
                    />
                    <p className="mt-4 font-semibold text-gray-900 dark:text-white">
                      Search Error
                    </p>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">
                      {searchError}
                    </p>
                  </div>
                )}

                {!isSearching &&
                  query &&
                  !searchError &&
                  searchResults.length === 0 && (
                    <div className="px-6 py-14 text-center text-sm sm:px-14">
                      <ExclamationTriangleIcon
                        className="mx-auto size-6 text-gray-400 dark:text-gray-500"
                        aria-hidden="true"
                      />
                      <p className="mt-4 font-semibold text-gray-900 dark:text-white">
                        No proposals found
                      </p>
                      <p className="mt-2 text-gray-500 dark:text-gray-400">
                        We couldn&apos;t find any proposals matching &quot;
                        {query}
                        &quot;. Try different keywords.
                      </p>
                    </div>
                  )}

                {!query && (
                  <div className="px-6 py-14 text-center text-sm sm:px-14">
                    <DocumentTextIcon
                      className="mx-auto size-6 text-gray-400 dark:text-gray-500"
                      aria-hidden="true"
                    />
                    <p className="mt-4 font-semibold text-gray-900 dark:text-white">
                      Search proposals
                    </p>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">
                      Search through proposal titles, descriptions, speaker
                      names, topics, and more.
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center bg-gray-50 px-4 py-2.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  <kbd className="mx-1 flex size-5 w-7 items-center justify-center gap-0.5 rounded border border-gray-400 bg-white font-semibold text-gray-900 sm:mx-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                    <span className="text-xs">⌘</span>K
                  </kbd>
                  <span className="ml-1">to open search</span>
                  <span className="mx-2">•</span>
                  <kbd className="mx-1 flex size-5 items-center justify-center rounded border border-gray-400 bg-white font-semibold text-gray-900 sm:mx-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                    ↵
                  </kbd>
                  <span className="ml-1">to select</span>
                  <span className="mx-2">•</span>
                  <kbd className="mx-1 flex size-5 w-7 items-center justify-center rounded border border-gray-400 bg-white font-semibold text-gray-900 sm:mx-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                    esc
                  </kbd>
                  <span className="ml-1">to close</span>
                </div>
              </Combobox>
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  )
}
