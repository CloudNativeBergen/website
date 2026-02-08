'use client'

import { api } from '@/lib/trpc/client'
import type {
  SponsorForConferenceExpanded,
  SponsorTag,
} from '@/lib/sponsor-crm/types'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
import { SponsorCard } from '@/components/admin/sponsor-crm/SponsorCard'
import {
  sortSponsorTiers,
  formatTierLabel,
} from '@/components/admin/sponsor-crm/utils'
import {
  TAGS,
  STATUSES,
  INVOICE_STATUSES,
  CONTRACT_STATUSES,
} from '@/components/admin/sponsor-crm/form/constants'
import { FilterDropdown, FilterOption } from '@/components/admin/FilterDropdown'
import { MobileFilterSheet } from '@/components/admin/sponsor-crm/MobileFilterSheet'
import {
  XMarkIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
} from '@heroicons/react/20/solid'
import { Conference } from '@/lib/conference/types'
import { SponsorTier } from '@/lib/sponsor/types'
import { useSponsorDragDrop } from '@/hooks/useSponsorDragDrop'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { DndContext, DragOverlay, pointerWithin } from '@dnd-kit/core'
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [currentView, setCurrentView] = useState<BoardView>('pipeline')
  const [searchQuery, setSearchQuery] = useState('')
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false)
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)

  const utils = api.useUtils()

  const { activeItem, isDragging, handleDragStart, handleDragEnd } =
    useSponsorDragDrop(currentView)

  const deleteMutation = api.sponsor.crm.delete.useMutation({
    onSuccess: () => {
      utils.sponsor.crm.list.invalidate()
    },
  })

  // Parse filters from URL
  const tiersFilter = useMemo(
    () => searchParams.get('tiers')?.split(',').filter(Boolean) || [],
    [searchParams],
  )
  const assignedToFilter = useMemo(
    () => searchParams.get('assigned_to') || undefined,
    [searchParams],
  )
  const tagsFilter = useMemo(
    () =>
      (searchParams.get('tags')?.split(',').filter(Boolean) ||
        []) as SponsorTag[],
    [searchParams],
  )

  // Pause background refresh when user is actively interacting
  const isUserBusy =
    isFormOpen || isEmailModalOpen || isDragging || selectedIds.length > 0

  // Fetch with filters
  const { data: sponsors = [], isLoading } = api.sponsor.crm.list.useQuery(
    {
      conferenceId,
      assigned_to:
        assignedToFilter === 'unassigned' ? undefined : assignedToFilter,
      unassigned_only: assignedToFilter === 'unassigned',
      tags: tagsFilter.length > 0 ? tagsFilter : undefined,
      tiers: tiersFilter.length > 0 ? tiersFilter : undefined,
    },
    {
      refetchInterval: isUserBusy ? false : 30_000,
      refetchOnWindowFocus: !isUserBusy,
    },
  )

  // Filter logic
  const filteredSponsors = useMemo(() => {
    let filtered =
      currentView === 'pipeline'
        ? sponsors
        : currentView === 'invoice'
          ? sponsors.filter(
            (s) => s.status === 'closed-won' && s.contract_value != null,
          )
          : sponsors.filter((s) => s.status === 'closed-won')

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      filtered = filtered.filter((s) =>
        s.sponsor.name.toLowerCase().includes(q),
      )
    }
    return filtered
  }, [sponsors, currentView, searchQuery])

  // Handlers
  const handleOpenForm = useCallback(
    (sponsor?: SponsorForConferenceExpanded) => {
      setSelectedSponsor(sponsor || null)
      setIsFormOpen(true)
    },
    [],
  )

  const handleCreateNew = useCallback(() => {
    setSelectedSponsor(null)
    setIsFormOpen(true)
  }, [])

  const handleCloseForm = useCallback(() => {
    setSelectedSponsor(null)
    setIsFormOpen(false)
  }, [])

  const handleOpenEmail = useCallback(
    (sponsor: SponsorForConferenceExpanded) => {
      setEmailSponsor(sponsor)
      setIsEmailModalOpen(true)
    },
    [],
  )

  const handleCloseEmail = useCallback(() => {
    setEmailSponsor(null)
    setIsEmailModalOpen(false)
  }, [])

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    )
  }, [])

  const handleClearSelection = useCallback(() => {
    setSelectedIds([])
  }, [])

  const handleSelectAllFiltered = useCallback(() => {
    const allFilteredIds = filteredSponsors.map((s) => s._id)
    setSelectedIds(allFilteredIds)
  }, [filteredSponsors])

  // Handle external trigger for new sponsor
  useEffect(() => {
    if (externalNewTrigger > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleCreateNew()
    }
  }, [externalNewTrigger, handleCreateNew])

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

  // Fetch tiers for filters
  const { data: tiers = [] } = api.sponsor.tiers.listByConference.useQuery({
    conferenceId,
  })

  // Use organizers from conference data
  const organizers = useMemo(() => {
    return [...(conference.organizers || [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((o) => ({
        _id: o._id,
        name: o.name,
        email: o.email,
        avatar: o.image,
      }))
  }, [conference.organizers])

  const handleDelete = useCallback(async (sponsorId: string) => {
    setDeleteConfirmId(sponsorId)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirmId) return
    await deleteMutation.mutateAsync({ id: deleteConfirmId })
    setDeleteConfirmId(null)
  }, [deleteConfirmId, deleteMutation])

  // Clear selection when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleClearSelection()
  }, [
    tiersFilter.length,
    assignedToFilter,
    tagsFilter.length,
    currentView,
    handleClearSelection,
  ])

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
  }, [handleCreateNew, handleOpenForm])

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
  const updateFilters = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  // Filter handlers
  const toggleTierFilter = useCallback(
    (tierId: string) => {
      const newTiers = tiersFilter.includes(tierId)
        ? tiersFilter.filter((t) => t !== tierId)
        : [...tiersFilter, tierId]
      updateFilters('tiers', newTiers.length > 0 ? newTiers.join(',') : null)
    },
    [tiersFilter, updateFilters],
  )

  const setOrganizerFilter = useCallback(
    (organizerId: string | null) => {
      updateFilters('assigned_to', organizerId)
    },
    [updateFilters],
  )

  const toggleTagFilter = useCallback(
    (tag: SponsorTag) => {
      const newTags = tagsFilter.includes(tag)
        ? tagsFilter.filter((t) => t !== tag)
        : [...tagsFilter, tag]
      updateFilters('tags', newTags.length > 0 ? newTags.join(',') : null)
    },
    [tagsFilter, updateFilters],
  )

  const clearAllFilters = useCallback(() => {
    router.push(window.location.pathname, { scroll: false })
  }, [router])

  const activeFilterCount =
    tiersFilter.length + (assignedToFilter ? 1 : 0) + tagsFilter.length

  const groupedSponsors = useMemo(() => {
    return filteredSponsors.reduce(
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
  }, [filteredSponsors, currentView])

  const columns = useMemo(() => {
    const source =
      currentView === 'pipeline'
        ? STATUSES
        : currentView === 'contract'
          ? CONTRACT_STATUSES
          : INVOICE_STATUSES
    return source.map((s) => ({
      key: s.value,
      label: ('columnLabel' in s && s.columnLabel) || s.label,
    }))
  }, [currentView])

  if (!conferenceId) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
        <p className="text-gray-500">No conference selected</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-2 lg:gap-4">
      {/* Modals */}
      <ConfirmationModal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        onConfirm={confirmDelete}
        title="Remove Sponsor"
        message="Are you sure you want to remove this sponsor from the pipeline?"
        confirmButtonText="Remove"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
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
          senderName={session?.user?.name || ''}
          conference={{
            title: conference.title || '',
            city: conference.city || '',
            country: conference.country || '',
            start_date: conference.start_date || '',
            organizer: conference.organizer,
            domains: conference.domains || [domain],
            social_links: conference.social_links,
            prospectus_url:
              conference.sponsorship_customization?.prospectus_url,
          }}
        />
      )}

      {/* Row 1: Clean toolbar */}
      <div className="shrink-0 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center gap-2 p-2 sm:gap-3">
          {/* View Switcher */}
          <div className="shrink-0">
            <BoardViewSwitcher
              currentView={currentView}
              onViewChange={setCurrentView}
            />
          </div>

          <div className="hidden h-6 w-px bg-gray-200 sm:block dark:bg-gray-700" />

          {/* Search - desktop: always visible, mobile: expandable */}
          <div className="hidden grow sm:block">
            <div className="group relative max-w-sm">
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
          </div>

          {/* Mobile: search toggle */}
          <button
            onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
            className={clsx(
              'ml-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors sm:hidden',
              isMobileSearchOpen || searchQuery
                ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400'
                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
            )}
          >
            <MagnifyingGlassIcon className="h-4.5 w-4.5" />
          </button>

          <div className="hidden h-6 w-px bg-gray-200 sm:block dark:bg-gray-700" />

          {/* Filter dropdowns - desktop only */}
          <div className="hidden items-center gap-1.5 lg:flex">
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
              {TAGS.map((tag) => (
                <FilterOption
                  key={tag.value}
                  onClick={() => toggleTagFilter(tag.value)}
                  checked={tagsFilter.includes(tag.value)}
                  keepOpen
                >
                  {tag.label}
                </FilterOption>
              ))}
            </FilterDropdown>
          </div>

          {/* Mobile: Filter button with badge */}
          <button
            onClick={() => setIsMobileFilterOpen(true)}
            className={clsx(
              'relative flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors lg:hidden',
              activeFilterCount > 0
                ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300 ring-inset dark:bg-indigo-900/40 dark:text-indigo-300 dark:ring-indigo-700'
                : 'text-gray-600 ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:text-gray-400 dark:ring-white/10 dark:hover:bg-gray-800',
            )}
          >
            <FunnelIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Filter</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white dark:bg-indigo-500">
                {activeFilterCount}
              </span>
            )}
          </button>

          <div className="ml-auto hidden h-6 w-px bg-gray-200 sm:block dark:bg-gray-700" />

          {/* Select all / Clear selection */}
          {selectedIds.length === 0 ? (
            <button
              onClick={handleSelectAllFiltered}
              className="hidden h-9 items-center justify-center rounded-lg bg-white px-3 text-xs font-medium text-gray-600 ring-1 ring-gray-300 transition-all ring-inset hover:bg-indigo-50 hover:text-indigo-600 sm:flex dark:bg-white/5 dark:text-gray-400 dark:ring-white/10 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400"
            >
              Select all
            </button>
          ) : (
            <button
              onClick={handleClearSelection}
              className="hidden h-9 items-center justify-center rounded-lg bg-white px-3 text-xs font-medium text-red-600 ring-1 ring-gray-300 transition-all ring-inset hover:bg-red-50 hover:ring-red-200 sm:flex dark:bg-white/5 dark:text-red-400 dark:ring-white/10 dark:hover:bg-red-900/20 dark:hover:ring-red-900/30"
            >
              Clear ({selectedIds.length})
            </button>
          )}
        </div>

        {/* Mobile: expandable search row */}
        {isMobileSearchOpen && (
          <div className="border-t border-gray-200 px-2 py-2 sm:hidden dark:border-gray-800">
            <div className="group relative">
              <MagnifyingGlassIcon className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-indigo-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sponsors..."
                autoFocus
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
          </div>
        )}

        {/* Row 2: Active filter pills (appears only when filters are active) */}
        {(activeFilterCount > 0 || searchQuery) && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-200 px-2.5 py-2 dark:border-gray-800">
            {/* Tier pills */}
            {tiersFilter.map((tierId) => {
              const tier = tiers.find((t) => t._id === tierId)
              return (
                <FilterPill
                  key={`tier-${tierId}`}
                  label={tier ? formatTierLabel(tier) : tierId}
                  category="Tier"
                  onRemove={() => toggleTierFilter(tierId)}
                />
              )
            })}

            {/* Owner pill */}
            {assignedToFilter && (
              <FilterPill
                label={
                  assignedToFilter === 'unassigned'
                    ? 'Unassigned'
                    : organizers.find((o) => o._id === assignedToFilter)
                      ?.name || 'Owner'
                }
                category="Owner"
                onRemove={() => setOrganizerFilter(null)}
              />
            )}

            {/* Tag pills */}
            {tagsFilter.map((tag) => {
              const tagDef = TAGS.find((t) => t.value === tag)
              return (
                <FilterPill
                  key={`tag-${tag}`}
                  label={tagDef?.label || tag}
                  category="Tag"
                  onRemove={() => toggleTagFilter(tag)}
                />
              )
            })}

            {/* Search pill */}
            {searchQuery && (
              <FilterPill
                label={searchQuery}
                category="Search"
                onRemove={() => setSearchQuery('')}
              />
            )}

            {/* Clear all */}
            <button
              onClick={() => {
                clearAllFilters()
                setSearchQuery('')
              }}
              className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Mobile Filter Sheet */}
      <MobileFilterSheet
        isOpen={isMobileFilterOpen}
        onClose={() => setIsMobileFilterOpen(false)}
        tiers={tiers}
        tiersFilter={tiersFilter}
        onToggleTier={toggleTierFilter}
        organizers={organizers}
        assignedToFilter={assignedToFilter}
        onSetOrganizer={setOrganizerFilter}
        tagsFilter={tagsFilter}
        onToggleTag={toggleTagFilter}
        onClearAll={() => {
          clearAllFilters()
          setSearchQuery('')
        }}
        activeFilterCount={activeFilterCount}
      />

      {/* Bulk Actions (Overlay style when items selected) */}
      {selectedIds.length > 0 && (
        <SponsorBulkActions
          selectedIds={selectedIds}
          onClearSelection={handleClearSelection}
          onSuccess={() => utils.sponsor.crm.list.invalidate()}
        />
      )}

      {/* Board Columns */}
      <DndContext
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        collisionDetection={pointerWithin}
      >
        <div
          className={clsx(
            'min-h-0 flex-1',
            'flex snap-x snap-mandatory gap-3 overflow-x-auto',
            'lg:grid lg:snap-none lg:gap-1 lg:overflow-x-visible',
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
                columnKey={column.key}
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
              />
            )
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeItem && (
            <div className="scale-105 rotate-3 transform opacity-90 shadow-lg">
              <SponsorCard
                sponsor={activeItem.sponsor}
                currentView={currentView}
                onEdit={() => { }}
                onDelete={() => { }}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function FilterPill({
  label,
  category,
  onRemove,
}: {
  label: string
  category: string
  onRemove: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 py-0.5 pr-1 pl-2.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 ring-inset dark:bg-indigo-900/30 dark:text-indigo-300 dark:ring-indigo-800">
      <span className="text-indigo-400 dark:text-indigo-500">{category}:</span>
      <span className="max-w-32 truncate">{label}</span>
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-indigo-200 hover:text-indigo-900 dark:hover:bg-indigo-800 dark:hover:text-indigo-100"
      >
        <XMarkIcon className="h-3 w-3" />
      </button>
    </span>
  )
}
