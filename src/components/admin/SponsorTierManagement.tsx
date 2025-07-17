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
} from '@heroicons/react/24/outline'
import { ConferenceSponsor } from '@/lib/conference/types'
import { SponsorTierExisting } from '@/lib/sponsor/types'
import { formatCurrency } from '@/lib/format'
import { removeSponsorFromConference } from '@/lib/sponsor/client'
import SponsorAddModal from './SponsorAddModal'

interface SponsorManagementProps {
  sponsors: ConferenceSponsor[]
  sponsorTiers: SponsorTierExisting[]
  sponsorsByTier: Record<string, ConferenceSponsor[]>
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
  }>({ isOpen: false, preselectedTierId: undefined })
  const [removingSponsors, setRemovingSponsors] = useState<Set<string>>(
    new Set(),
  )

  const addSponsorToState = (newSponsor: ConferenceSponsor) => {
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
  }

  const openAddModal = (tierId?: string) => {
    setModalState({ isOpen: true, preselectedTierId: tierId })
  }

  const closeAddModal = () => {
    setModalState({ isOpen: false, preselectedTierId: undefined })
  }

  const handleRemoveSponsor = async (
    sponsorName: string,
    sponsorRef: string,
  ) => {
    const confirmMessage = `Are you sure you want to remove "${sponsorName}" from this conference? This action cannot be undone.`

    if (!confirm(confirmMessage)) {
      return
    }

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
    } catch (error) {
      console.error('Failed to remove sponsor:', error)
      alert(error instanceof Error ? error.message : 'Failed to remove sponsor')
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
                      {tier && tier.price.length > 0 && (
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
                          <div className="flex items-center justify-start">
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                              <TagIcon className="mr-1 h-3 w-3" />
                              Active
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
                      {tier.price.length > 0 && (
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
        key={modalState.preselectedTierId || 'default'}
        isOpen={modalState.isOpen}
        onClose={closeAddModal}
        sponsorTiers={sponsorTiers}
        preselectedTierId={modalState.preselectedTierId}
        onSponsorAdded={addSponsorToState}
      />
    </div>
  )
}
