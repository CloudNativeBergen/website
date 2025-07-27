'use client'

import React, { useState } from 'react'
import {
  BuildingOffice2Icon,
  GlobeAltIcon,
  TagIcon,
  CurrencyDollarIcon,
  PlusIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  PencilIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import {
  ConferenceSponsorWithContact,
  SponsorTierExisting,
} from '@/lib/sponsor/types'
import { formatCurrency } from '@/lib/format'
import { removeSponsorFromConference } from '@/lib/sponsor/client'
import { useNotification } from './NotificationProvider'
import { ConfirmationModal } from './ConfirmationModal'
import SponsorAddModal from './SponsorAddModal'

interface SponsorManagementProps {
  sponsors: ConferenceSponsorWithContact[]
  sponsorTiers: SponsorTierExisting[]
  sponsorsByTier: Record<string, ConferenceSponsorWithContact[]>
  sortedTierNames: string[]
}

export default function SponsorTierManagement({
  sponsors: initialSponsors,
  sponsorTiers,
  sponsorsByTier: initialSponsorsByTier,
  sortedTierNames: initialSortedTierNames,
}: SponsorManagementProps) {
  const [sponsors, setSponsors] = useState(initialSponsors)
  const [sponsorsByTier, setSponsorsByTier] = useState(initialSponsorsByTier)
  const [sortedTierNames, setSortedTierNames] = useState(initialSortedTierNames)
  const [modalState, setModalState] = useState<{
    isOpen: boolean
    preselectedTierId?: string
    editingSponsor?: ConferenceSponsorWithContact | null
  }>({ isOpen: false, preselectedTierId: undefined, editingSponsor: null })
  const [removingSponsors, setRemovingSponsors] = useState<Set<string>>(
    new Set(),
  )
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean
    sponsorName: string
    sponsorRef: string
  }>({ isOpen: false, sponsorName: '', sponsorRef: '' })
  const { showNotification } = useNotification()

  // Helper functions to check missing information
  const isMissingContactInfo = (
    sponsor: ConferenceSponsorWithContact,
  ): boolean => {
    const missing =
      !sponsor.sponsor.contact_persons ||
      sponsor.sponsor.contact_persons.length === 0
    console.log('Debug - Contact info for', sponsor.sponsor.name, ':', {
      contact_persons: sponsor.sponsor.contact_persons,
      missing,
    })
    return missing
  }

  const isMissingBillingInfo = (
    sponsor: ConferenceSponsorWithContact,
  ): boolean => {
    const missing = !sponsor.sponsor.billing || !sponsor.sponsor.billing.email
    console.log('Debug - Billing info for', sponsor.sponsor.name, ':', {
      billing: sponsor.sponsor.billing,
      missing,
    })
    return missing
  }

  // Helper functions to count missing information
  const sponsorsWithMissingContactInfo = sponsors.filter(isMissingContactInfo)
  const sponsorsWithMissingBillingInfo = sponsors.filter(isMissingBillingInfo)
  const hasAnyMissingInfo =
    sponsorsWithMissingContactInfo.length > 0 ||
    sponsorsWithMissingBillingInfo.length > 0

  // Debug logging
  console.log('Debug - Sponsors count:', sponsors.length)
  console.log(
    'Debug - Missing contact info:',
    sponsorsWithMissingContactInfo.length,
  )
  console.log(
    'Debug - Missing billing info:',
    sponsorsWithMissingBillingInfo.length,
  )
  console.log('Debug - Has any missing info:', hasAnyMissingInfo)
  console.log(
    'Debug - Should show warning:',
    sponsors.length > 0 && hasAnyMissingInfo,
  )

  const addSponsorToState = (newSponsor: ConferenceSponsorWithContact) => {
    // Add to sponsors array
    setSponsors((prev) => [...prev, newSponsor])

    // Add to sponsorsByTier
    setSponsorsByTier((prev) => {
      const tierName = newSponsor.tier.title
      const currentTierSponsors = prev[tierName] || []
      return {
        ...prev,
        [tierName]: [...currentTierSponsors, newSponsor],
      }
    })

    // Add tier to sortedTierNames if it's not already there
    setSortedTierNames((prev) => {
      const tierName = newSponsor.tier.title
      if (!prev.includes(tierName)) {
        return [...prev, tierName]
      }
      return prev
    })

    // Show success notification
    showNotification({
      type: 'success',
      title: 'Sponsor added successfully',
      message: `${newSponsor.sponsor.name} has been added to the ${newSponsor.tier.title} tier.`,
    })
  }

  const openAddModal = (tierId?: string) => {
    setModalState({
      isOpen: true,
      preselectedTierId: tierId,
      editingSponsor: null,
    })
  }

  const openEditModal = (sponsor: ConferenceSponsorWithContact) => {
    setModalState({
      isOpen: true,
      editingSponsor: sponsor,
      preselectedTierId: undefined,
    })
  }

  const closeModal = () => {
    setModalState({
      isOpen: false,
      preselectedTierId: undefined,
      editingSponsor: null,
    })
  }

  const updateSponsorInState = (
    updatedSponsor: ConferenceSponsorWithContact,
  ) => {
    // Update sponsors array
    setSponsors((prev) =>
      prev.map((sponsor) =>
        sponsor.sponsor.name === updatedSponsor.sponsor.name
          ? updatedSponsor
          : sponsor,
      ),
    )

    // Update sponsorsByTier
    setSponsorsByTier((prev) => {
      const newSponsorsByTier = { ...prev }

      // Remove from old tier
      Object.keys(newSponsorsByTier).forEach((tierName) => {
        newSponsorsByTier[tierName] = newSponsorsByTier[tierName].filter(
          (sponsor) => sponsor.sponsor.name !== updatedSponsor.sponsor.name,
        )
      })

      // Add to new tier
      const tierName = updatedSponsor.tier.title
      if (!newSponsorsByTier[tierName]) {
        newSponsorsByTier[tierName] = []
      }
      newSponsorsByTier[tierName].push(updatedSponsor)

      return newSponsorsByTier
    })

    // Show success notification
    showNotification({
      type: 'success',
      title: 'Sponsor updated successfully',
      message: `${updatedSponsor.sponsor.name} has been updated.`,
    })
  }

  const handleRemoveSponsor = async (
    sponsorName: string,
    sponsorRef: string,
  ) => {
    setConfirmationModal({
      isOpen: true,
      sponsorName,
      sponsorRef,
    })
  }

  const confirmRemoveSponsor = async () => {
    const { sponsorName, sponsorRef } = confirmationModal
    setConfirmationModal({ isOpen: false, sponsorName: '', sponsorRef: '' })
    setRemovingSponsors((prev) => new Set(prev).add(sponsorRef))

    try {
      await removeSponsorFromConference(sponsorRef)

      // Update local state
      const updatedSponsors = sponsors.filter(
        (s) => s.sponsor.name !== sponsorName,
      )
      setSponsors(updatedSponsors)

      // Update sponsorsByTier
      const newSponsorsByTier = { ...sponsorsByTier }
      Object.keys(newSponsorsByTier).forEach((tierName) => {
        newSponsorsByTier[tierName] = newSponsorsByTier[tierName].filter(
          (s) => s.sponsor.name !== sponsorName,
        )
      })
      setSponsorsByTier(newSponsorsByTier)

      // Update sorted tier names (remove empty tiers)
      const newSortedTierNames = sortedTierNames.filter(
        (tierName) => newSponsorsByTier[tierName]?.length > 0,
      )
      setSortedTierNames(newSortedTierNames)

      showNotification({
        type: 'success',
        title: 'Sponsor removed',
        message: `${sponsorName} has been successfully removed from the conference.`,
      })
    } catch (error) {
      console.error('Failed to remove sponsor:', error)
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to remove sponsor'
      showNotification({
        type: 'error',
        title: 'Failed to remove sponsor',
        message: errorMessage,
      })
    } finally {
      setRemovingSponsors((prev) => {
        const newSet = new Set(prev)
        newSet.delete(sponsorRef)
        return newSet
      })
    }
  }

  const handleDownloadSvg = (sponsorName: string, svgContent: string) => {
    // Create blob with SVG content
    const blob = new Blob([svgContent], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)

    // Create and trigger download
    const link = document.createElement('a')
    const fileName = `${sponsorName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-logo.svg`

    link.href = url
    link.download = fileName
    link.style.display = 'none'

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // Cleanup
    setTimeout(() => URL.revokeObjectURL(url), 100)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-medium text-gray-900">Current Sponsors</h2>
        <button
          onClick={() => openAddModal()}
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:justify-start"
        >
          <PlusIcon className="mr-1 h-4 w-4" />
          Add Sponsor
        </button>
      </div>

      {/* Warning Section for Missing Information */}
      {sponsors.length > 0 && hasAnyMissingInfo && (
        <div className="rounded-md bg-yellow-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Sponsor Information Incomplete
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>Some sponsors are missing required information:</p>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  {sponsorsWithMissingContactInfo.length > 0 && (
                    <li>
                      {sponsorsWithMissingContactInfo.length} sponsor
                      {sponsorsWithMissingContactInfo.length !== 1 ? 's' : ''}{' '}
                      missing contact information
                    </li>
                  )}
                  {sponsorsWithMissingBillingInfo.length > 0 && (
                    <li>
                      {sponsorsWithMissingBillingInfo.length} sponsor
                      {sponsorsWithMissingBillingInfo.length !== 1 ? 's' : ''}{' '}
                      missing billing information
                    </li>
                  )}
                </ul>
                <p className="mt-2">
                  Look for red indicators (🔴) on sponsor cards below and click
                  the edit button to add missing information.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {sponsors.length === 0 ? (
        <div className="py-12 text-center">
          <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">
            No sponsors yet
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by adding your first sponsor to a tier.
          </p>
          <div className="mt-6">
            <button
              onClick={() => openAddModal()}
              className="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:w-auto sm:justify-start"
            >
              <PlusIcon className="mr-1 h-4 w-4" />
              Add Sponsor
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedTierNames.map((tierName) => {
            const tierSponsors = sponsorsByTier[tierName]
            const tier = sponsorTiers.find((t) => t.title === tierName)

            if (!tierSponsors || tierSponsors.length === 0) {
              return null
            }

            return (
              <div key={tierName}>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:space-x-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-md font-medium text-gray-900">
                        {tierName}
                      </h3>
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                        {tierSponsors.length} sponsor
                        {tierSponsors.length !== 1 ? 's' : ''}
                      </span>
                      {tier && tier.price && tier.price.length > 0 && (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                          <CurrencyDollarIcon className="mr-1 h-3 w-3" />
                          {formatCurrency(
                            Math.max(...tier.price.map((p) => p.amount)),
                            tier.price[0].currency,
                          )}
                        </span>
                      )}
                    </div>
                    {tier?.tagline && (
                      <div className="mt-1 sm:mt-0">
                        <span className="text-xs text-gray-500 sm:text-sm">
                          {tier.tagline}
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => openAddModal(tier?._id)}
                    className="self-start text-sm text-indigo-600 hover:text-indigo-500 sm:self-auto"
                  >
                    Add to tier
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {tierSponsors.map((sponsorData, index) => {
                    const sponsor = sponsorData.sponsor
                    const isRemoving = removingSponsors.has(sponsor.name)

                    return (
                      <div
                        key={`${sponsor.name}-${index}`}
                        className="group relative rounded-lg border border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 sm:p-6"
                      >
                        <div className="absolute top-2 right-2 flex space-x-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {sponsor.logo && (
                            <button
                              onClick={() =>
                                handleDownloadSvg(sponsor.name, sponsor.logo)
                              }
                              className="rounded-md bg-blue-50 p-1.5 text-blue-600 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                              title="Download SVG logo"
                            >
                              <ArrowDownTrayIcon className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(sponsorData)}
                            className="rounded-md bg-indigo-50 p-1.5 text-indigo-600 hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                            title="Edit sponsor"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              handleRemoveSponsor(sponsor.name, sponsor.name)
                            }
                            disabled={isRemoving}
                            className="rounded-md bg-red-50 p-1.5 text-red-600 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Remove sponsor"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="flex items-start space-x-4">
                          <div className="flex-shrink-0">
                            {sponsor.logo ? (
                              <div
                                className="flex h-12 w-12 items-center justify-center"
                                dangerouslySetInnerHTML={{
                                  __html: sponsor.logo,
                                }}
                                style={{
                                  maxWidth: '48px',
                                  maxHeight: '48px',
                                }}
                              />
                            ) : (
                              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
                                <BuildingOffice2Icon className="h-6 w-6 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-medium text-gray-900 sm:truncate">
                              {sponsor.name}
                            </h4>
                            {sponsor.website && (
                              <div className="mt-2">
                                <a
                                  href={sponsor.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center text-sm text-gray-500 hover:text-indigo-600"
                                >
                                  <GlobeAltIcon className="mr-1 h-4 w-4" />
                                  Visit Website
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-4">
                          <div className="flex items-center justify-start space-x-2">
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
                              <TagIcon className="mr-1 h-3 w-3" />
                              Active
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                                isMissingContactInfo(sponsorData)
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-green-100 text-green-800'
                              }`}
                              title={
                                isMissingContactInfo(sponsorData)
                                  ? 'Missing contact information'
                                  : 'Contact information complete'
                              }
                            >
                              <UserGroupIcon
                                className={`h-3 w-3 ${!isMissingContactInfo(sponsorData) ? 'mr-1' : ''}`}
                              />
                              {!isMissingContactInfo(sponsorData) && 'Contact'}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                                isMissingBillingInfo(sponsorData)
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-green-100 text-green-800'
                              }`}
                              title={
                                isMissingBillingInfo(sponsorData)
                                  ? 'Missing billing information'
                                  : 'Billing information complete'
                              }
                            >
                              <CurrencyDollarIcon
                                className={`h-3 w-3 ${!isMissingBillingInfo(sponsorData) ? 'mr-1' : ''}`}
                              />
                              {!isMissingBillingInfo(sponsorData) && 'Billing'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Add sponsors to existing tiers that have no sponsors */}
          {sponsorTiers.some(
            (tier) =>
              !sponsorsByTier[tier.title] ||
              sponsorsByTier[tier.title].length === 0,
          ) && (
            <div className="border-t border-gray-200 pt-8">
              <h3 className="text-md mb-4 font-medium text-gray-900">
                Available Tiers
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sponsorTiers
                  .filter(
                    (tier) =>
                      !sponsorsByTier[tier.title] ||
                      sponsorsByTier[tier.title].length === 0,
                  )
                  .map((tier) => (
                    <div
                      key={tier._id}
                      className="relative block rounded-lg border-2 border-dashed border-gray-300 p-4 text-center hover:border-gray-400 sm:p-6"
                    >
                      <TagIcon className="mx-auto h-6 w-6 text-gray-400 sm:h-8 sm:w-8" />
                      <span className="mt-2 block text-sm font-medium text-gray-900">
                        {tier.title}
                      </span>
                      <span className="mt-1 block text-xs text-gray-500 sm:text-sm">
                        {tier.tagline}
                      </span>
                      {tier.price && tier.price.length > 0 && (
                        <span className="mt-2 inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                          <CurrencyDollarIcon className="mr-1 h-3 w-3" />
                          {formatCurrency(
                            Math.max(...tier.price.map((p) => p.amount)),
                            tier.price[0].currency,
                          )}
                        </span>
                      )}
                      <button
                        onClick={() => openAddModal(tier._id)}
                        className="mt-3 inline-flex w-full items-center justify-center text-sm font-medium text-indigo-600 hover:text-indigo-500 sm:w-auto"
                      >
                        <PlusIcon className="mr-1 h-4 w-4" />
                        Add sponsor
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      <SponsorAddModal
        key={
          modalState.editingSponsor
            ? `edit-${modalState.editingSponsor.sponsor.name}`
            : modalState.preselectedTierId || 'default'
        }
        isOpen={modalState.isOpen}
        onClose={closeModal}
        sponsorTiers={sponsorTiers}
        preselectedTierId={modalState.preselectedTierId}
        editingSponsor={modalState.editingSponsor}
        onSponsorAdded={addSponsorToState}
        onSponsorUpdated={updateSponsorInState}
      />

      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={() =>
          setConfirmationModal({
            isOpen: false,
            sponsorName: '',
            sponsorRef: '',
          })
        }
        onConfirm={confirmRemoveSponsor}
        title="Remove Sponsor"
        message={`Are you sure you want to remove "${confirmationModal.sponsorName}" from this conference? This action cannot be undone.`}
        confirmButtonText="Remove"
        variant="danger"
        isLoading={removingSponsors.has(confirmationModal.sponsorRef)}
      />
    </div>
  )
}
