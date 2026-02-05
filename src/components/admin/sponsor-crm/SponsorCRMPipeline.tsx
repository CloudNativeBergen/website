'use client'

import { api } from '@/lib/trpc/client'
import type {
  SponsorForConferenceExpanded,
  SponsorTag,
} from '@/lib/sponsor-crm/types'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { SponsorCRMForm } from '@/components/admin/sponsor-crm/SponsorCRMForm'
import { SponsorIndividualEmailModal } from '@/components/admin'
import {
  BoardViewSwitcher,
  type BoardView,
} from '@/components/admin/sponsor-crm/BoardViewSwitcher'
import { SponsorBoardColumn } from '@/components/admin/sponsor-crm/SponsorBoardColumn'
import { SponsorBulkActions } from '@/components/admin/sponsor-crm/SponsorBulkActions'
import {
  sortSponsorTiers,
  formatTierLabel,
} from '@/components/admin/sponsor-crm/utils'
import { FilterDropdown, FilterOption } from '@/components/admin/FilterDropdown'
import { XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid'
import { Conference } from '@/lib/conference/types'
import { SponsorTier } from '@/lib/sponsor/types'
import clsx from 'clsx'

interface SponsorCRMPipelineProps {
  conferenceId: string
  conference: Conference
  domain: string
  externalNewTrigger?: number
}

export function SponsorCRMPipeline({
  conferenceId,
  conference,
  domain,
  externalNewTrigger = 0,
}: SponsorCRMPipelineProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const hasDefaultedRef = useRef(false)

  const [selectedSponsor, setSelectedSponsor] =
    useState<SponsorForConferenceExpanded | null>(null)
  const [emailSponsor, setEmailSponsor] =
    useState<SponsorForConferenceExpanded | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [currentView, setCurrentView] = useState<BoardView>('pipeline')
  const [searchQuery, setSearchQuery] = useState('')

  const utils = api.useUtils()

  const deleteMutation = api.sponsor.crm.delete.useMutation({
    onSuccess: () => {
      utils.sponsor.crm.list.invalidate()
    },
  })

  // Handlers
  const handleOpenForm = (sponsor?: SponsorForConferenceExpanded) => {
    setSelectedSponsor(sponsor || null)
    setIsFormOpen(true)
  }

  const handleCreateNew = () => {
    setSelectedSponsor(null)
    setIsFormOpen(true)
  }

  const handleCloseForm = () => {
    setSelectedSponsor(null)
    setIsFormOpen(false)
  }

  const handleOpenEmail = (sponsor: SponsorForConferenceExpanded) => {
    setEmailSponsor(sponsor)
    setIsEmailModalOpen(true)
  }

  const handleCloseEmail = () => {
    setEmailSponsor(null)
    setIsEmailModalOpen(false)
  }

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    )
  }

  const handleClearSelection = () => {
    setSelectedIds([])
  }

  const handleSelectAllFiltered = () => {
    const allFilteredIds = filteredSponsors.map((s) => s._id)
    setSelectedIds(allFilteredIds)
  }

  // Handle external trigger for new sponsor
  useEffect(() => {
    if (externalNewTrigger > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleCreateNew()
    }
  }, [externalNewTrigger])

  // Parse filters from URL
  const tiersFilter =
    searchParams.get('tiers')?.split(',').filter(Boolean) || []
  const assignedToFilter = searchParams.get('assigned_to') || undefined
  const tagsFilter = (searchParams.get('tags')?.split(',').filter(Boolean) ||
    []) as SponsorTag[]

  // Default to current user's assigned sponsors if no assignedTo filter is set
  useEffect(() => {
    if (hasDefaultedRef.current) return
    if (!session?.speaker?._id) return

    if (!searchParams.has('assigned_to')) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('assigned_to', session.speaker._id)
      router.replace(`?${params.toString()}`, { scroll: false })
    }
    hasDefaultedRef.current = true
  }, [session?.speaker?._id, searchParams, router])

  // Fetch with filters
  const { data: sponsors = [], isLoading } = api.sponsor.crm.list.useQuery({
    conferenceId,
    assigned_to:
      assignedToFilter === 'unassigned' ? undefined : assignedToFilter,
    unassigned_only: assignedToFilter === 'unassigned',
    tags: tagsFilter.length > 0 ? tagsFilter : undefined,
    tiers: tiersFilter.length > 0 ? tiersFilter : undefined,
  })

  // Fetch tiers for filters
  const { data: tiers = [] } = api.sponsor.tiers.listByConference.useQuery({
    conferenceId,
  })

  // Use organizers from conference data
  const organizers =
    [...(conference.organizers || [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((o) => ({
        _id: o._id,
        name: o.name,
        email: o.email,
        avatar: o.image,
      })) || []

  const handleDelete = async (sponsorId: string) => {
    if (
      !confirm(
        'Are you sure you want to remove this sponsor from the pipeline?',
      )
    ) {
      return
    }
    await deleteMutation.mutateAsync({ id: sponsorId })
  }

  // Clear selection when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleClearSelection()
  }, [tiersFilter.length, assignedToFilter, tagsFilter.length, currentView])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault()
        handleOpenForm()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        handleCreateNew()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Handle sponsor query parameter
  useEffect(() => {
    const sponsorId = searchParams.get('sponsor')
    if (sponsorId && sponsors.length > 0 && !isFormOpen) {
      const sponsor = sponsors.find((s) => s._id === sponsorId)
      if (sponsor) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedSponsor(sponsor)
        setIsFormOpen(true)
        const params = new URLSearchParams(searchParams.toString())
        params.delete('sponsor')
        router.replace(
          params.toString()
            ? `?${params.toString()}`
            : window.location.pathname,
          { scroll: false },
        )
      }
    }
  }, [searchParams, sponsors, isFormOpen, router])

  // Update URL with filters
  const updateFilters = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`?${params.toString()}`, { scroll: false })
  }

  // Filter handlers
  const toggleTierFilter = (tierId: string) => {
    const newTiers = tiersFilter.includes(tierId)
      ? tiersFilter.filter((t) => t !== tierId)
      : [...tiersFilter, tierId]
    updateFilters('tiers', newTiers.length > 0 ? newTiers.join(',') : null)
  }

  const setOrganizerFilter = (organizerId: string | null) => {
    updateFilters('assigned_to', organizerId)
  }

  const toggleTagFilter = (tag: SponsorTag) => {
    const newTags = tagsFilter.includes(tag)
      ? tagsFilter.filter((t) => t !== tag)
      : [...tagsFilter, tag]
    updateFilters('tags', newTags.length > 0 ? newTags.join(',') : null)
  }

  const clearAllFilters = () => {
    router.push(window.location.pathname, { scroll: false })
  }

  // Filter logic
  let filteredSponsors =
    currentView === 'pipeline'
      ? sponsors
      : currentView === 'invoice'
        ? sponsors.filter(
            (s) => s.status === 'closed-won' && s.contract_value != null,
          )
        : sponsors.filter((s) => s.status === 'closed-won')

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim()
    filteredSponsors = filteredSponsors.filter((s) =>
      s.sponsor.name.toLowerCase().includes(q),
    )
  }

  const activeFilterCount =
    tiersFilter.length + (assignedToFilter ? 1 : 0) + tagsFilter.length

  const availableTags: SponsorTag[] = [
    'warm-lead',
    'returning-sponsor',
    'cold-outreach',
    'referral',
    'high-priority',
    'needs-follow-up',
    'multi-year-potential',
    'previously-declined',
  ]

  const groupedSponsors = filteredSponsors.reduce(
    (acc, sponsor) => {
      let key: string
      if (currentView === 'pipeline') {
        key = sponsor.status
      } else if (currentView === 'contract') {
        key = sponsor.contract_status
      } else {
        key = sponsor.invoice_status
      }
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(sponsor)
      return acc
    },
    {} as Record<string, SponsorForConferenceExpanded[]>,
  )

  const columns =
    currentView === 'pipeline'
      ? [
          { key: 'prospect', label: 'Prospect' },
          { key: 'contacted', label: 'Contacted' },
          { key: 'negotiating', label: 'Negotiating' },
          { key: 'closed-won', label: 'Closed - Won' },
          { key: 'closed-lost', label: 'Closed - Lost' },
        ]
      : currentView === 'contract'
        ? [
            { key: 'none', label: 'No Contract' },
            { key: 'verbal-agreement', label: 'Verbal Agreement' },
            { key: 'contract-sent', label: 'Contract Sent' },
            { key: 'contract-signed', label: 'Contract Signed' },
          ]
        : [
            { key: 'not-sent', label: 'Not Sent' },
            { key: 'sent', label: 'Sent' },
            { key: 'overdue', label: 'Overdue' },
            { key: 'paid', label: 'Paid' },
            { key: 'cancelled', label: 'Cancelled' },
          ]

  if (!conferenceId) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
        <p className="text-gray-500">No conference selected</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Modals */}
      {isFormOpen && (
        <SponsorCRMForm
          key={selectedSponsor?._id || 'new'}
          conferenceId={conferenceId}
          sponsor={selectedSponsor}
          isOpen={isFormOpen}
          onClose={handleCloseForm}
          onSuccess={() => {
            utils.sponsor.crm.list.invalidate()
          }}
          onEmailTrigger={handleOpenEmail}
          existingSponsorsInCRM={sponsors.map((s) => s.sponsor._id)}
        />
      )}

      {emailSponsor && conference && (
        <SponsorIndividualEmailModal
          isOpen={isEmailModalOpen}
          onClose={handleCloseEmail}
          sponsorForConference={emailSponsor}
          domain={domain}
          fromEmail={conference.sponsor_email || ''}
          conference={{
            title: conference.title || '',
            city: conference.city || '',
            country: conference.country || '',
            start_date: conference.start_date || '',
            domains: conference.domains || [domain],
            social_links: conference.social_links,
          }}
        />
      )}

      {/* THE UNIFIED CLEAN TOOLBAR - SINGLE LINE */}
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        {/* Navigation */}
        <div className="flex-shrink-0">
          <BoardViewSwitcher
            currentView={currentView}
            onViewChange={setCurrentView}
          />
        </div>

        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Search */}
        <div className="group relative max-w-sm flex-grow">
          <MagnifyingGlassIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-indigo-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sponsors..."
            className="h-9 w-full rounded-lg bg-gray-50 pr-8 pl-9 text-sm ring-1 ring-gray-300 transition-all ring-inset focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:ring-inset dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-gray-500 dark:focus:bg-white/10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <FilterDropdown
              label="Tier"
              activeCount={tiersFilter.length}
              position="left"
              size="sm"
            >
              {tiers.length === 0 ? (
                <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                  No tiers available
                </div>
              ) : (
                sortSponsorTiers(tiers).map((tier: SponsorTier) => (
                  <FilterOption
                    key={tier._id}
                    onClick={() => toggleTierFilter(tier._id)}
                    checked={tiersFilter.includes(tier._id)}
                    keepOpen
                  >
                    {formatTierLabel(tier)}
                  </FilterOption>
                ))
              )}
            </FilterDropdown>

            <FilterDropdown
              label="Owner"
              activeCount={assignedToFilter ? 1 : 0}
              position="left"
              size="sm"
            >
              <FilterOption
                onClick={() => setOrganizerFilter(null)}
                checked={!assignedToFilter}
                type="radio"
              >
                All Owners
              </FilterOption>
              <FilterOption
                onClick={() => setOrganizerFilter('unassigned')}
                checked={assignedToFilter === 'unassigned'}
                type="radio"
              >
                Unassigned
              </FilterOption>
              <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
              {organizers.map((organizer) => (
                <FilterOption
                  key={organizer._id}
                  onClick={() => setOrganizerFilter(organizer._id)}
                  checked={assignedToFilter === organizer._id}
                  type="radio"
                >
                  {organizer.name}
                </FilterOption>
              ))}
            </FilterDropdown>

            <FilterDropdown
              label="Tags"
              activeCount={tagsFilter.length}
              position="left"
              size="sm"
            >
              {availableTags.map((tag) => (
                <FilterOption
                  key={tag}
                  onClick={() => toggleTagFilter(tag)}
                  checked={tagsFilter.includes(tag)}
                  keepOpen
                >
                  {tag
                    .split('-')
                    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ')}
                </FilterOption>
              ))}
            </FilterDropdown>
          </div>

          {(activeFilterCount > 0 || searchQuery) && (
            <button
              onClick={() => {
                clearAllFilters()
                setSearchQuery('')
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-gray-400 ring-1 ring-gray-300 transition-all ring-inset hover:bg-red-50 hover:text-red-500 hover:ring-red-200 dark:bg-white/5 dark:text-gray-400 dark:ring-white/10 dark:hover:bg-red-900/20 dark:hover:ring-red-900/30"
              title="Clear all filters"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Selection / Count */}
        <div className="ml-auto flex items-center gap-3 pl-4">
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
              {filteredSponsors.length}
            </span>
            <span className="text-[10px] tracking-wider text-gray-500 uppercase dark:text-gray-400">
              Sponsors
            </span>
          </div>
          {selectedIds.length > 0 && (
            <div className="flex flex-col items-end border-l border-gray-200 pl-3 dark:border-gray-700">
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                {selectedIds.length}
              </span>
              <span className="text-[10px] tracking-wider text-indigo-500/70 uppercase dark:text-indigo-400/70">
                Selected
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Actions (Overlay style when items selected) */}
      {selectedIds.length > 0 && (
        <SponsorBulkActions
          selectedIds={selectedIds}
          onClearSelection={handleClearSelection}
          onSuccess={() => utils.sponsor.crm.list.invalidate()}
        />
      )}

      {/* Selection Utility Hint (Only if filters active and nothing selected) */}
      {selectedIds.length === 0 && (activeFilterCount > 0 || searchQuery) && (
        <div className="flex justify-end px-1">
          <button
            onClick={handleSelectAllFiltered}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Select all {filteredSponsors.length} filtered results
          </button>
        </div>
      )}

      {/* Board Columns */}
      <div
        className={clsx(
          'grid grid-cols-1 gap-4',
          currentView === 'pipeline' && 'lg:grid-cols-5',
          currentView === 'invoice' && 'lg:grid-cols-5',
          currentView === 'contract' && 'lg:grid-cols-4',
        )}
      >
        {columns.map((column) => {
          const columnSponsors = groupedSponsors[column.key] || []
          return (
            <SponsorBoardColumn
              key={column.key}
              title={column.label}
              sponsors={columnSponsors}
              isLoading={isLoading}
              currentView={currentView}
              selectedIds={selectedIds}
              isSelectionMode={selectedIds.length > 0}
              onSponsorClick={handleOpenForm}
              onSponsorDelete={handleDelete}
              onSponsorEmail={handleOpenEmail}
              onSponsorToggleSelect={handleToggleSelect}
              onAddClick={() => handleOpenForm()}
              emptyMessage="No sponsors"
            />
          )
        })}
      </div>
    </div>
  )
}
