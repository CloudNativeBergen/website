'use client'

import React, { useState } from 'react'
import { SponsorLogo } from '@/components/SponsorLogo'
import {
  BuildingOffice2Icon,
  GlobeAltIcon,
  TagIcon,
  CurrencyDollarIcon,
  PlusIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  PencilIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import {
  ConferenceSponsorWithContact,
  SponsorTierExisting,
} from '@/lib/sponsor/types'
import { formatCurrency } from '@/lib/format'
import { formatTierLabel, downloadSvg } from '@/lib/sponsor/utils'
import { useNotification } from './NotificationProvider'
import { ConfirmationModal } from './ConfirmationModal'
import SponsorAddModal from './SponsorAddModal'
import { api } from '@/lib/trpc/client'

const ADMIN_LOGO_SIZE = { maxWidth: '48px', maxHeight: '48px' }

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
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean
    sponsorName: string
    sponsorId: string
  }>({ isOpen: false, sponsorName: '', sponsorId: '' })
  const { showNotification } = useNotification()

  const removeSponsorMutation = api.sponsor.removeFromConference.useMutation({
    onSuccess: () => {
      showNotification({
        type: 'success',
        title: 'Sponsor removed',
        message: 'Sponsor has been successfully removed from the conference.',
      })
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Failed to remove sponsor',
        message: error.message,
      })
    },
  })

  const isMissingContactInfo = (
    sponsor: ConferenceSponsorWithContact,
  ): boolean => {
    return (
      !sponsor.sponsor.contact_persons ||
      sponsor.sponsor.contact_persons.length === 0
    )
  }

  const isMissingBillingInfo = (
    sponsor: ConferenceSponsorWithContact,
  ): boolean => {
    return !sponsor.sponsor.billing || !sponsor.sponsor.billing.email
  }

  const addSponsorToState = (newSponsor: ConferenceSponsorWithContact) => {
    setSponsors((prev) =>
      [...prev, newSponsor].sort((a, b) =>
        a.sponsor.name.localeCompare(b.sponsor.name),
      ),
    )

    setSponsorsByTier((prev) => {
      const tierName = newSponsor.tier.title
      const currentTierSponsors = prev[tierName] || []
      const updatedTierSponsors = [...currentTierSponsors, newSponsor].sort(
        (a, b) => a.sponsor.name.localeCompare(b.sponsor.name),
      )
      return {
        ...prev,
        [tierName]: updatedTierSponsors,
      }
    })

    setSortedTierNames((prev) => {
      const tierName = newSponsor.tier.title
      if (!prev.includes(tierName)) {
        return [...prev, tierName]
      }
      return prev
    })

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
    setSponsors((prev) =>
      prev
        .map((sponsor) =>
          sponsor.sponsor.name === updatedSponsor.sponsor.name
            ? updatedSponsor
            : sponsor,
        )
        .sort((a, b) => a.sponsor.name.localeCompare(b.sponsor.name)),
    )

    setSponsorsByTier((prev) => {
      const newSponsorsByTier = { ...prev }

      Object.keys(newSponsorsByTier).forEach((tierName) => {
        newSponsorsByTier[tierName] = newSponsorsByTier[tierName].filter(
          (sponsor) => sponsor.sponsor.name !== updatedSponsor.sponsor.name,
        )
      })

      const tierName = updatedSponsor.tier.title
      if (!newSponsorsByTier[tierName]) {
        newSponsorsByTier[tierName] = []
      }
      newSponsorsByTier[tierName].push(updatedSponsor)

      // Sort sponsors alphabetically within each tier
      Object.keys(newSponsorsByTier).forEach((tierTitle) => {
        newSponsorsByTier[tierTitle].sort((a, b) =>
          a.sponsor.name.localeCompare(b.sponsor.name),
        )
      })

      return newSponsorsByTier
    })

    showNotification({
      type: 'success',
      title: 'Sponsor updated successfully',
      message: `${updatedSponsor.sponsor.name} has been updated.`,
    })
  }

  const handleRemoveSponsor = async (
    sponsorName: string,
    sponsorId: string,
  ) => {
    setConfirmationModal({
      isOpen: true,
      sponsorName,
      sponsorId,
    })
  }

  const confirmRemoveSponsor = async () => {
    const { sponsorName, sponsorId } = confirmationModal
    setConfirmationModal({ isOpen: false, sponsorName: '', sponsorId: '' })

    try {
      await removeSponsorMutation.mutateAsync({ id: sponsorId })

      const updatedSponsors = sponsors
        .filter((s) => s.sponsor.name !== sponsorName)
        .sort((a, b) => a.sponsor.name.localeCompare(b.sponsor.name))
      setSponsors(updatedSponsors)

      const newSponsorsByTier = { ...sponsorsByTier }
      Object.keys(newSponsorsByTier).forEach((tierName) => {
        newSponsorsByTier[tierName] = newSponsorsByTier[tierName]
          .filter((s) => s.sponsor.name !== sponsorName)
          .sort((a, b) => a.sponsor.name.localeCompare(b.sponsor.name))
      })
      setSponsorsByTier(newSponsorsByTier)

      const newSortedTierNames = sortedTierNames.filter(
        (tierName) => newSponsorsByTier[tierName]?.length > 0,
      )
      setSortedTierNames(newSortedTierNames)
    } catch {}
  }

  const handleDownloadSvg = (sponsorName: string, svgContent: string) => {
    const fileName = `${sponsorName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-logo.svg`
    downloadSvg(svgContent, fileName)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          Current Sponsors
        </h2>
        <button
          onClick={() => openAddModal()}
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:justify-start"
        >
          <PlusIcon className="mr-1 h-4 w-4" />
          Add Sponsor
        </button>
      </div>

      {sponsors.length === 0 ? (
        <div className="py-12 text-center">
          <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
            No sponsors yet
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
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
                      <h3 className="text-md font-medium text-gray-900 dark:text-white">
                        {tier ? formatTierLabel(tier) : tierName}
                      </h3>
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                        {tierSponsors.length} sponsor
                        {tierSponsors.length !== 1 ? 's' : ''}
                      </span>
                      {tier && tier.price && tier.price.length > 0 && (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-800 dark:text-green-200">
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
                        <span className="text-xs text-gray-500 sm:text-sm dark:text-gray-400">
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
                    const sponsorId = sponsor._id

                    return (
                      <div
                        key={`${sponsor.name}-${index}`}
                        className="group relative rounded-lg border border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 sm:p-6 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500"
                      >
                        <div className="absolute top-2 right-2 flex space-x-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {sponsor.logo && (
                            <button
                              onClick={() =>
                                handleDownloadSvg(sponsor.name, sponsor.logo!)
                              }
                              className="rounded-md bg-blue-50 p-1.5 text-blue-600 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-900/50 dark:text-blue-400 dark:hover:bg-blue-900"
                              title="Download SVG logo"
                            >
                              <ArrowDownTrayIcon className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(sponsorData)}
                            className="rounded-md bg-indigo-50 p-1.5 text-indigo-600 hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400 dark:hover:bg-indigo-900"
                            title="Edit sponsor"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              handleRemoveSponsor(sponsor.name, sponsorId)
                            }
                            disabled={removeSponsorMutation.isPending}
                            className="rounded-md bg-red-50 p-1.5 text-red-600 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-900/50 dark:text-red-400 dark:hover:bg-red-900"
                            title="Remove sponsor"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="flex items-start space-x-4">
                          <div className="shrink-0">
                            <SponsorLogo
                              logo={sponsor.logo}
                              logoBright={sponsor.logo_bright}
                              name={sponsor.name}
                              style={ADMIN_LOGO_SIZE}
                              className="flex h-12 w-12 items-center justify-center"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-medium text-gray-900 sm:truncate dark:text-white">
                              {sponsor.name}
                            </h4>
                            {sponsor.website && (
                              <div className="mt-2">
                                <a
                                  href={sponsor.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center text-sm text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400"
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
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 dark:bg-green-800 dark:text-green-200">
                              <TagIcon className="mr-1 h-3 w-3" />
                              Active
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                                isMissingContactInfo(sponsorData)
                                  ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200'
                                  : 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200'
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
                                  ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-200'
                                  : 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200'
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

          {sponsorTiers.some(
            (tier) =>
              !sponsorsByTier[tier.title] ||
              sponsorsByTier[tier.title].length === 0,
          ) && (
            <div className="border-t border-gray-200 pt-8 dark:border-gray-700">
              <h3 className="text-md mb-4 font-medium text-gray-900 dark:text-white">
                Available Tiers
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sponsorTiers
                  .filter(
                    (tier) =>
                      !sponsorsByTier[tier.title] ||
                      sponsorsByTier[tier.title].length === 0,
                  )
                  .sort((a, b) => {
                    const getMaxPrice = (tier: SponsorTierExisting) => {
                      if (!tier.price || tier.price.length === 0) return 0
                      return Math.max(...tier.price.map((p) => p.amount))
                    }
                    return getMaxPrice(b) - getMaxPrice(a)
                  })
                  .map((tier) => (
                    <div
                      key={tier._id}
                      className="relative block rounded-lg border-2 border-dashed border-gray-300 p-4 text-center hover:border-gray-400 sm:p-6 dark:border-gray-600 dark:hover:border-gray-500"
                    >
                      <TagIcon className="mx-auto h-6 w-6 text-gray-400 sm:h-8 sm:w-8 dark:text-gray-500" />
                      <span className="mt-2 block text-sm font-medium text-gray-900 dark:text-white">
                        {tier.title}
                      </span>
                      <span className="mt-1 block text-xs text-gray-500 sm:text-sm dark:text-gray-400">
                        {tier.tagline}
                      </span>
                      {tier.price && tier.price.length > 0 && (
                        <span className="mt-2 inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-800 dark:text-green-200">
                          <CurrencyDollarIcon className="mr-1 h-3 w-3" />
                          {formatCurrency(
                            Math.max(...tier.price.map((p) => p.amount)),
                            tier.price[0].currency,
                          )}
                        </span>
                      )}
                      <button
                        onClick={() => openAddModal(tier._id)}
                        className="mt-3 inline-flex w-full items-center justify-center text-sm font-medium text-indigo-600 hover:text-indigo-500 sm:w-auto dark:text-indigo-400 dark:hover:text-indigo-300"
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
            sponsorId: '',
          })
        }
        onConfirm={confirmRemoveSponsor}
        title="Remove Sponsor"
        message={`Are you sure you want to remove "${confirmationModal.sponsorName}" from this conference? This action cannot be undone.`}
        confirmButtonText="Remove"
        variant="danger"
        isLoading={removeSponsorMutation.isPending}
      />
    </div>
  )
}
