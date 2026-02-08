'use client'

import { Fragment } from 'react'
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { SponsorTag } from '@/lib/sponsor-crm/types'
import { SponsorTier } from '@/lib/sponsor/types'
import {
  sortSponsorTiers,
  formatTierLabel,
} from '@/components/admin/sponsor-crm/utils'
import { TAGS } from '@/components/admin/sponsor-crm/form/constants'
import clsx from 'clsx'

interface Organizer {
  _id: string
  name: string
  email?: string
  avatar?: string
}

interface MobileFilterSheetProps {
  isOpen: boolean
  onClose: () => void
  tiers: SponsorTier[]
  tiersFilter: string[]
  onToggleTier: (tierId: string) => void
  organizers: Organizer[]
  assignedToFilter: string | undefined
  onSetOrganizer: (organizerId: string | null) => void
  tagsFilter: SponsorTag[]
  onToggleTag: (tag: SponsorTag) => void
  onClearAll: () => void
  activeFilterCount: number
}

export function MobileFilterSheet({
  isOpen,
  onClose,
  tiers,
  tiersFilter,
  onToggleTier,
  organizers,
  assignedToFilter,
  onSetOrganizer,
  tagsFilter,
  onToggleTag,
  onClearAll,
  activeFilterCount,
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
          <DialogPanel className="fixed inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white shadow-2xl dark:bg-gray-900">
            {/* Handle bar */}
            <div className="sticky top-0 z-10 bg-white pt-3 pb-2 dark:bg-gray-900">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-600" />
              <div className="flex items-center justify-between px-5">
                <DialogTitle className="text-base font-semibold text-gray-900 dark:text-white">
                  Filters
                </DialogTitle>
                <button
                  onClick={onClose}
                  className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-6 px-5 pb-6">
              {/* Tier Section */}
              <FilterSection title="Tier">
                {tiers.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No tiers available
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {sortSponsorTiers(tiers).map((tier: SponsorTier) => (
                      <FilterChip
                        key={tier._id}
                        label={formatTierLabel(tier)}
                        active={tiersFilter.includes(tier._id)}
                        onClick={() => onToggleTier(tier._id)}
                      />
                    ))}
                  </div>
                )}
              </FilterSection>

              {/* Owner Section */}
              <FilterSection title="Owner">
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    label="All"
                    active={!assignedToFilter}
                    onClick={() => onSetOrganizer(null)}
                  />
                  <FilterChip
                    label="Unassigned"
                    active={assignedToFilter === 'unassigned'}
                    onClick={() => onSetOrganizer('unassigned')}
                  />
                  {organizers.map((org) => (
                    <FilterChip
                      key={org._id}
                      label={org.name}
                      active={assignedToFilter === org._id}
                      onClick={() => onSetOrganizer(org._id)}
                    />
                  ))}
                </div>
              </FilterSection>

              {/* Tags Section */}
              <FilterSection title="Tags">
                <div className="flex flex-wrap gap-2">
                  {TAGS.map((tag) => (
                    <FilterChip
                      key={tag.value}
                      label={tag.label}
                      active={tagsFilter.includes(tag.value)}
                      onClick={() => onToggleTag(tag.value)}
                    />
                  ))}
                </div>
              </FilterSection>
            </div>

            {/* Sticky footer */}
            <div className="sticky bottom-0 flex items-center gap-3 border-t border-gray-200 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-900">
              {activeFilterCount > 0 && (
                <button
                  onClick={onClearAll}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={onClose}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                {activeFilterCount > 0 ? `Show results` : 'Done'}
              </button>
            </div>
          </DialogPanel>
        </TransitionChild>
      </Dialog>
    </Transition>
  )
}

function FilterSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
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
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300 ring-inset dark:bg-indigo-900/40 dark:text-indigo-300 dark:ring-indigo-700'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
      )}
    >
      {label}
    </button>
  )
}
