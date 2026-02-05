'use client'

import { api } from '@/lib/trpc/client'
import type {
  SponsorForConferenceExpanded,
  SponsorTag,
} from '@/lib/sponsor-crm/types'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SponsorCRMForm } from '@/components/admin/sponsor-crm/SponsorCRMForm'
import { ImportHistoricSponsorsButton } from '@/components/admin/sponsor-crm/ImportHistoricSponsorsButton'
import { SponsorIndividualEmailModal } from '@/components/admin/SponsorIndividualEmailModal'
import {
  BoardViewSwitcher,
  type BoardView,
} from '@/components/admin/sponsor-crm/BoardViewSwitcher'
import { SponsorBoardColumn } from '@/components/admin/sponsor-crm/SponsorBoardColumn'
import { SponsorBulkActions } from '@/components/admin/sponsor-crm/SponsorBulkActions'
import { FilterDropdown, FilterOption } from '@/components/admin/FilterDropdown'
import { XMarkIcon, CheckIcon, PlusIcon } from '@heroicons/react/20/solid'
import { Conference } from '@/lib/conference/types'

interface SponsorCRMClientProps {
  conferenceId: string
  conference: Conference
  domain: string
}

export function SponsorCRMClient({
  conferenceId,
  conference,
  domain,
}: SponsorCRMClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedSponsor, setSelectedSponsor] =
    useState<SponsorForConferenceExpanded | null>(null)
  const [emailSponsor, setEmailSponsor] =
    useState<SponsorForConferenceExpanded | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [currentView, setCurrentView] = useState<BoardView>('pipeline')

  // Parse filters from URL
  const tiersFilter =
    searchParams.get('tiers')?.split(',').filter(Boolean) || []
  const assignedToFilter = searchParams.get('assigned_to') || undefined
  const tagsFilter = searchParams.get('tags')?.split(',').filter(Boolean) as
    | SponsorTag[]
    | undefined

  // Fetch with filters
  const { data: sponsors = [], isLoading } = api.sponsor.crm.list.useQuery({
    conferenceId,
    assigned_to: assignedToFilter,
    tags: tagsFilter,
    tiers: tiersFilter.length > 0 ? tiersFilter : undefined,
  })

  // Fetch tiers for filters
  const { data: tiers = [] } = api.sponsor.tiers.listByConference.useQuery({
    conferenceId,
  })

  // Use organizers from conference data
  const organizers =
    conference.organizers?.map((o) => ({
      _id: o._id,
      name: o.name,
      email: o.email,
      avatar: o.image,
    })) || []

  const utils = api.useUtils()

  const deleteMutation = api.sponsor.crm.delete.useMutation({
    onSuccess: () => {
      utils.sponsor.crm.list.invalidate()
    },
  })

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

  // Clear selection when filters change to avoid accidental bulk updates on hidden items
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear selection when view/filters change
    handleClearSelection()
  }, [tiersFilter.length, assignedToFilter, tagsFilter?.length, currentView])

  // CMD+O / CTRL+O keyboard shortcut to open new sponsor form
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault()
        handleOpenForm()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Handle sponsor query parameter to auto-open form
  useEffect(() => {
    const sponsorId = searchParams.get('sponsor')
    if (sponsorId && sponsors.length > 0 && !isFormOpen) {
      const sponsor = sponsors.find((s) => s._id === sponsorId)
      if (sponsor) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional sync from URL params
        setSelectedSponsor(sponsor)

        setIsFormOpen(true)
        // Remove the sponsor param from URL after opening
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
  }, [
    searchParams,
    sponsors,
    isFormOpen,
    router,
    setSelectedSponsor,
    setIsFormOpen,
  ])

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
    const newTags = tagsFilter?.includes(tag)
      ? tagsFilter.filter((t) => t !== tag)
      : [...(tagsFilter || []), tag]
    updateFilters('tags', newTags.length > 0 ? newTags.join(',') : null)
  }

  const clearAllFilters = () => {
    router.push(window.location.pathname, { scroll: false })
  }

  // Filter sponsors based on current view (filters already applied server-side)
  // Contract and Invoice boards only show closed-won sponsors
  // Invoice board also requires a contract value
  const filteredSponsors =
    currentView === 'pipeline'
      ? sponsors
      : currentView === 'invoice'
        ? sponsors.filter(
            (s) => s.status === 'closed-won' && s.contract_value != null,
          )
        : sponsors.filter((s) => s.status === 'closed-won')

  // Calculate active filter count
  const activeFilterCount =
    tiersFilter.length + (assignedToFilter ? 1 : 0) + (tagsFilter?.length || 0)

  // Available tags
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

  // Group sponsors by status, contract status, or invoice status
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

  // Define columns based on view
  const getColumns = (): Array<{ key: string; label: string }> => {
    if (currentView === 'pipeline') {
      return [
        { key: 'prospect', label: 'Prospect' },
        { key: 'contacted', label: 'Contacted' },
        { key: 'negotiating', label: 'Negotiating' },
        { key: 'closed-won', label: 'Closed - Won' },
        { key: 'closed-lost', label: 'Closed - Lost' },
      ]
    } else if (currentView === 'contract') {
      return [
        { key: 'none', label: 'No Contract' },
        { key: 'verbal-agreement', label: 'Verbal Agreement' },
        { key: 'contract-sent', label: 'Contract Sent' },
        { key: 'contract-signed', label: 'Contract Signed' },
      ]
    } else {
      return [
        { key: 'not-sent', label: 'Not Sent' },
        { key: 'sent', label: 'Sent' },
        { key: 'overdue', label: 'Overdue' },
        { key: 'paid', label: 'Paid' },
        { key: 'cancelled', label: 'Cancelled' },
      ]
    }
  }

  const columns = getColumns()

  if (!conferenceId) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
        <p className="text-gray-500">No conference selected</p>
      </div>
    )
  }

  return (
    <div className="mt-8 space-y-4">
      {/* Form Modal */}
      {isFormOpen && (
        <SponsorCRMForm
          conferenceId={conferenceId}
          conference={conference}
          domain={domain}
          sponsor={selectedSponsor}
          isOpen={isFormOpen}
          onClose={handleCloseForm}
          onSuccess={() => {
            utils.sponsor.crm.list.invalidate()
          }}
          existingSponsorsInCRM={sponsors.map((s) => s.sponsor._id)}
        />
      )}

      {/* Email Modal */}
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

      {/* Filters and View Switcher */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Tier Filter */}
          <FilterDropdown
            label="Tier"
            activeCount={tiersFilter.length}
            position="left"
            width="wide"
          >
            {tiers.length === 0 ? (
              <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                No tiers available
              </div>
            ) : (
              tiers.map((tier) => (
                <FilterOption
                  key={tier._id}
                  onClick={() => toggleTierFilter(tier._id)}
                  checked={tiersFilter.includes(tier._id)}
                  keepOpen
                >
                  {tier.title}
                </FilterOption>
              ))
            )}
          </FilterDropdown>

          {/* Organizer Filter */}
          <FilterDropdown
            label="Assigned To"
            activeCount={assignedToFilter ? 1 : 0}
            position="left"
            width="wide"
          >
            <FilterOption
              onClick={() => setOrganizerFilter(null)}
              checked={!assignedToFilter}
              type="radio"
            >
              All Organizers
            </FilterOption>
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

          {/* Tags Filter */}
          <FilterDropdown
            label="Tags"
            activeCount={tagsFilter?.length || 0}
            position="left"
            width="wide"
          >
            {availableTags.map((tag) => (
              <FilterOption
                key={tag}
                onClick={() => toggleTagFilter(tag)}
                checked={tagsFilter?.includes(tag) || false}
                keepOpen
              >
                {tag
                  .split('-')
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ')}
              </FilterOption>
            ))}
          </FilterDropdown>

          {/* Clear Filters */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={clearAllFilters}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                <XMarkIcon className="h-4 w-4" />
                Clear {activeFilterCount}{' '}
                {activeFilterCount === 1 ? 'filter' : 'filters'}
              </button>
              <button
                onClick={handleSelectAllFiltered}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
              >
                <CheckIcon className="h-4 w-4" />
                Select all filtered ({filteredSponsors.length})
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCreateNew}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-700"
          >
            <PlusIcon className="-ml-0.5 h-5 w-5" aria-hidden="true" />
            Create New
          </button>
          <ImportHistoricSponsorsButton
            conferenceId={conferenceId}
            onSuccess={() => {
              utils.sponsor.crm.list.invalidate()
            }}
          />
          <BoardViewSwitcher
            currentView={currentView}
            onViewChange={setCurrentView}
          />
        </div>
      </div>

      {/* Bulk Actions Bar */}
      <SponsorBulkActions
        selectedIds={selectedIds}
        onClearSelection={handleClearSelection}
        onSuccess={() => {
          utils.sponsor.crm.list.invalidate()
        }}
      />

      {/* Board Columns */}
      <div
        className={`grid grid-cols-1 gap-4 ${currentView === 'pipeline' ? 'lg:grid-cols-5' : currentView === 'invoice' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}
      >
        {columns.map((column) => {
          const columnSponsors = groupedSponsors[column.key] || []

          return (
            <SponsorBoardColumn
              key={column.key}
              title={column.label}
              sponsors={columnSponsors}
              isLoading={isLoading}
              selectedIds={selectedIds}
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
