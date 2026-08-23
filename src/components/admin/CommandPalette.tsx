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
} from '@heroicons/react/24/outline'
import { useState, useMemo } from 'react'
import { SkeletonSearchResult } from './LoadingSkeleton'
import {
  searchDestinations,
  visibleDestinations,
  type AdminDestination,
} from '@/lib/admin/registry'
import type { FeatureId } from '@/lib/features/registry'
import {
  useDebouncedDataSearch,
  useUnifiedSearch,
  type SearchResultItem,
} from '@/lib/search'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  /**
   * Per-organization features the current org is entitled to. Destinations
   * tagged with a `feature` the org lacks are not searchable at all (omitted =
   * none, fail-closed) — matching the sidebar, which hides the same entries.
   */
  enabledFeatures?: readonly FeatureId[]
}

const NO_FEATURES: readonly FeatureId[] = []

/**
 * ⌘K command palette for the admin dashboard. Destinations from the static
 * admin registry (pages + settings anchors) rank instantly with local
 * prefix/subsequence scoring; live data results (proposals, speakers,
 * sponsors) stream in below them via `useUnifiedSearch`. With an empty query
 * it lists every destination — a keyboard-first sitemap.
 */
export function CommandPalette({
  open,
  onClose,
  enabledFeatures = NO_FEATURES,
}: CommandPaletteProps) {
  const { theme } = useTheme()
  const [rawQuery, setRawQuery] = useState('')
  const {
    search,
    isSearching,
    searchResults,
    searchError,
    navigateTo,
    clearSearch,
  } = useUnifiedSearch()

  const query = rawQuery.toLowerCase().trim()

  const destinationGroups = useMemo(
    () => searchDestinations(query, visibleDestinations(enabledFeatures)),
    [query, enabledFeatures],
  )

  // The ≥2-character floor and the debounce window live in the hook so they are
  // testable without rendering this dialog. Registry destinations above are
  // unaffected — they rank locally and stay instant at one character.
  useDebouncedDataSearch(query, search, clearSearch)

  const handleClose = () => {
    setRawQuery('')
    clearSearch()
    onClose()
  }

  const handleSelect = (value: AdminDestination | SearchResultItem | null) => {
    if (!value) {
      return
    }
    navigateTo('href' in value ? value.href : value.url)
    handleClose()
  }

  const hasDestinations = destinationGroups.length > 0
  const hasDataResults = Boolean(query) && searchResults.totalCount > 0

  return (
    <Transition appear show={open}>
      {/* z-50 matches the ModalShell family — the palette must layer above the
          admin's sticky headers (z-40), which previously overlapped it. */}
      <Dialog
        as="div"
        className={`relative z-50 ${theme === 'dark' ? 'dark' : ''}`}
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

        <div className="fixed inset-0 overflow-y-auto p-4 sm:p-6 md:p-20">
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
              className="mx-auto w-full max-w-xl min-w-0 transform divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5 transition-all data-closed:scale-95 data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in dark:divide-gray-700 dark:bg-gray-900 dark:ring-gray-700"
            >
              <Combobox
                onChange={(value) => {
                  if (value && typeof value === 'object' && 'id' in value) {
                    handleSelect(value as AdminDestination | SearchResultItem)
                  }
                }}
              >
                <div className="grid grid-cols-1">
                  <ComboboxInput
                    autoFocus
                    className="col-start-1 row-start-1 h-12 w-full pr-4 pl-11 text-base text-ellipsis text-gray-900 outline-hidden placeholder:text-gray-400 sm:text-sm dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500"
                    placeholder="Search pages, settings, proposals, speakers, sponsors..."
                    value={rawQuery}
                    onChange={(event) => setRawQuery(event.target.value)}
                  />
                  <MagnifyingGlassIcon
                    className="pointer-events-none col-start-1 row-start-1 ml-4 size-5 self-center text-gray-400 dark:text-gray-500"
                    aria-hidden="true"
                  />
                </div>

                {(hasDestinations || hasDataResults) && (
                  <ComboboxOptions
                    static
                    as="ul"
                    className="max-h-80 transform-gpu scroll-py-10 scroll-pb-2 space-y-4 overflow-y-auto p-4 pb-2"
                  >
                    {destinationGroups.map((group) => (
                      <li key={group.group}>
                        <h2 className="text-xs font-semibold text-gray-900 dark:text-white">
                          {group.group}
                        </h2>
                        <ul className="-mx-4 mt-2 text-sm text-gray-700 dark:text-gray-300">
                          {group.items.map((destination) => {
                            const Icon = destination.icon || DocumentTextIcon
                            return (
                              <ComboboxOption
                                as="li"
                                key={destination.id}
                                value={destination}
                                className="group flex cursor-default items-center px-4 py-2 select-none data-focus:bg-indigo-600 data-focus:text-white data-focus:outline-hidden dark:data-focus:bg-indigo-500"
                              >
                                <div className="shrink-0">
                                  <div className="flex size-6 flex-none items-center justify-center rounded-full bg-gray-200 group-data-focus:bg-white/20 dark:bg-gray-700 dark:group-data-focus:bg-white/20">
                                    <Icon className="size-4 text-gray-400 group-data-focus:text-white dark:text-gray-500" />
                                  </div>
                                </div>
                                <div className="ml-3 min-w-0 flex-auto">
                                  <div className="truncate font-medium dark:text-white">
                                    {destination.title}
                                  </div>
                                </div>
                                {destination.kind === 'setting' && (
                                  <span className="ml-3 shrink-0 text-xs text-gray-400 group-data-focus:text-white/70 dark:text-gray-500">
                                    Settings
                                  </span>
                                )}
                              </ComboboxOption>
                            )
                          })}
                        </ul>
                      </li>
                    ))}

                    {hasDataResults &&
                      searchResults.groups.map((group) => (
                        <li key={group.category}>
                          <h2 className="text-xs font-semibold text-gray-900 dark:text-white">
                            {group.label} ({group.items.length})
                          </h2>
                          <ul className="-mx-4 mt-2 text-sm text-gray-700 dark:text-gray-300">
                            {group.items.map((item) => {
                              const Icon = item.icon || DocumentTextIcon
                              return (
                                <ComboboxOption
                                  as="li"
                                  key={item.id}
                                  value={item}
                                  className="group flex cursor-default items-center px-4 py-2 select-none data-focus:bg-indigo-600 data-focus:text-white data-focus:outline-hidden dark:data-focus:bg-indigo-500"
                                >
                                  <div className="shrink-0">
                                    <div className="flex size-6 flex-none items-center justify-center rounded-full bg-gray-200 group-data-focus:bg-white/20 dark:bg-gray-700 dark:group-data-focus:bg-white/20">
                                      <Icon className="size-4 text-gray-400 group-data-focus:text-white dark:text-gray-500" />
                                    </div>
                                  </div>
                                  {/* min-w-0 on the container + truncate on
                                      each text line: truncating only the
                                      wrapper clips child blocks without an
                                      ellipsis and lets long nowrap titles
                                      dictate the row's min-content width
                                      (mobile overflow). */}
                                  <div className="ml-3 min-w-0 flex-auto">
                                    <div className="truncate font-medium dark:text-white">
                                      {item.title}
                                    </div>
                                    {item.subtitle && (
                                      <div className="truncate text-xs text-gray-500 group-data-focus:text-white/70 dark:text-gray-400">
                                        {item.subtitle}
                                      </div>
                                    )}
                                    {item.description && (
                                      <div className="truncate text-xs text-gray-500 group-data-focus:text-white/70 dark:text-gray-400">
                                        {item.description}
                                      </div>
                                    )}
                                  </div>
                                </ComboboxOption>
                              )
                            })}
                          </ul>
                        </li>
                      ))}

                    {query && isSearching && (
                      <li className="-mt-2">
                        <SkeletonSearchResult items={2} />
                      </li>
                    )}
                  </ComboboxOptions>
                )}

                {query &&
                  isSearching &&
                  !hasDestinations &&
                  !hasDataResults && (
                    <div className="max-h-80 transform-gpu scroll-py-10 scroll-pb-2 space-y-4 overflow-y-auto p-4 pb-2">
                      <SkeletonSearchResult items={3} />
                      <div className="text-center">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Searching...
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

                {query &&
                  !isSearching &&
                  !searchError &&
                  !hasDestinations &&
                  !hasDataResults && (
                    <div className="px-6 py-14 text-center text-sm sm:px-14">
                      <ExclamationTriangleIcon
                        className="mx-auto size-6 text-gray-400 dark:text-gray-500"
                        aria-hidden="true"
                      />
                      <p className="mt-4 font-semibold text-gray-900 dark:text-white">
                        No results found
                      </p>
                      <p className="mt-2 text-gray-500 dark:text-gray-400">
                        We couldn&apos;t find anything matching &quot;{query}
                        &quot;. Try different keywords.
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
