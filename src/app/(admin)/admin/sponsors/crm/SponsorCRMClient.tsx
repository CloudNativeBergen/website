'use client'

import { api } from '@/lib/trpc/client'
import type {
  SponsorForConferenceExpanded,
  SponsorTag,
} from '@/lib/sponsor-crm/types'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SponsorCRMForm } from '@/components/admin/sponsor-crm/SponsorCRMForm'
import {
  BoardViewSwitcher,
  type BoardView,
} from '@/components/admin/sponsor-crm/BoardViewSwitcher'
import { SponsorBoardColumn } from '@/components/admin/sponsor-crm/SponsorBoardColumn'
import { FilterDropdown, FilterOption } from '@/components/admin/FilterDropdown'
import { XMarkIcon } from '@heroicons/react/20/solid'

interface SponsorCRMClientProps {
  conferenceId: string
}

export function SponsorCRMClient({ conferenceId }: SponsorCRMClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedSponsor, setSelectedSponsor] =
    useState<SponsorForConferenceExpanded | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
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

  // Fetch tiers and organizers for filters
  const { data: tiers = [] } = api.sponsor.tiers.listByConference.useQuery({
    conferenceId,
  })
  const { data: organizers = [] } = api.sponsor.crm.listOrganizers.useQuery()

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

  const handleCloseForm = () => {
    setSelectedSponsor(null)
    setIsFormOpen(false)
  }

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

  return (
    <div className="mt-8 space-y-4">
      {/* Form Modal */}
      <SponsorCRMForm
        conferenceId={conferenceId}
        sponsor={selectedSponsor}
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        onSuccess={() => {
          utils.sponsor.crm.list.invalidate()
        }}
        existingSponsorsInCRM={sponsors.map((s) => s.sponsor._id)}
      />

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
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <XMarkIcon className="h-4 w-4" />
              Clear {activeFilterCount}{' '}
              {activeFilterCount === 1 ? 'filter' : 'filters'}
            </button>
          )}
        </div>

        <BoardViewSwitcher
          currentView={currentView}
          onViewChange={setCurrentView}
        />
      </div>

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
              onSponsorClick={handleOpenForm}
              onSponsorDelete={handleDelete}
              onAddClick={() => handleOpenForm()}
              emptyMessage="No sponsors"
            />
          )
        })}
      </div>
    </div>
  )
}
