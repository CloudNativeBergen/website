'use client'

import { Fragment, ReactNode } from 'react'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import type { FilterGroup } from '@/components/admin/AdminFilterBar'

interface MobileFilterSheetProps {
  isOpen: boolean
  onClose: () => void
  /** Declarative filter groups rendered as chip sections. */
  groups: FilterGroup[]
  /** Clears all active filters. */
  onClearAll: () => void
  /** Number of active filters (drives footer copy). */
  activeFilterCount: number
  /** Extra controls rendered below the chip groups (dates, sort, etc.). */
  extra?: ReactNode
  /** Sheet heading. */
  title?: string
}

/**
 * Full-height, slide-up bottom sheet used below `lg` to host filter controls
 * on mobile. Config-driven via {@link FilterGroup}; rendered by
 * `AdminFilterBar` and reused directly by the sponsor CRM pipeline.
 */
export function MobileFilterSheet({
  isOpen,
  onClose,
  groups,
  onClearAll,
  activeFilterCount,
  extra,
  title = 'Filters',
}: MobileFilterSheetProps) {
  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50 lg:hidden">
        {/* Backdrop */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" />
        </TransitionChild>

        {/* Sheet */}
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="translate-y-full"
          enterTo="translate-y-0"
          leave="ease-in duration-200"
          leaveFrom="translate-y-0"
          leaveTo="translate-y-full"
        >
          <DialogPanel className="fixed inset-x-0 bottom-0 flex max-h-[90vh] flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-gray-900">
            {/* Handle bar */}
            <div className="shrink-0 bg-white pt-3 pb-2 dark:bg-gray-900">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
              <div className="flex items-center justify-between px-5">
                <DialogTitle className="text-base font-semibold text-gray-900 dark:text-white">
                  {title}
                </DialogTitle>
                <button
                  onClick={onClose}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                  aria-label="Close filters"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-6">
              {groups.map((group) => (
                <FilterSection key={group.key} title={group.label}>
                  {group.options.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {group.emptyText ?? 'No options available'}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {group.options.map((option) => (
                        <FilterChip
                          key={option.value}
                          label={option.label}
                          active={group.selected.includes(option.value)}
                          onClick={() => group.onChange(option.value)}
                        />
                      ))}
                    </div>
                  )}
                </FilterSection>
              ))}

              {extra}
            </div>

            {/* Sticky footer */}
            <div className="flex shrink-0 items-center gap-3 border-t border-gray-200 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-900">
              {activeFilterCount > 0 && (
                <button
                  onClick={onClearAll}
                  className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={onClose}
                className="flex min-h-11 flex-1 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                {activeFilterCount > 0 ? 'Show results' : 'Done'}
              </button>
            </div>
          </DialogPanel>
        </TransitionChild>
      </Dialog>
    </Transition>
  )
}

export function FilterSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div>
      <h3 className="mb-2.5 text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
        {title}
      </h3>
      {children}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium transition-colors',
        active
          ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300 ring-inset dark:bg-indigo-900/40 dark:text-indigo-300 dark:ring-indigo-700'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
      )}
    >
      {label}
    </button>
  )
}
