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
} from '@heroicons/react/24/outline'
import { ConferenceSponsor, SponsorTierExisting } from '@/lib/sponsor/types'
import { formatCurrency } from '@/lib/format'
import { formatTierLabel, downloadSvg } from '@/lib/sponsor/utils'
import { useNotification, ConfirmationModal } from '@/components/admin'
import { useRouter } from 'next/navigation'
import type { Conference } from '@/lib/conference/types'
import { SponsorCRMForm } from '@/components/admin/sponsor-crm/SponsorCRMForm'
import {
  SponsorRecordPanel,
  useRefreshSponsor,
  useSponsorRecordPanel,
} from '@/components/admin/sponsor-crm/SponsorRecordPanel'
import { api } from '@/lib/trpc/client'

const ADMIN_LOGO_SIZE = { maxWidth: '48px', maxHeight: '48px' }

interface SponsorManagementProps {
  conference: Conference
  domain: string
  canSendDiscountCodes?: boolean
  workshopsEnabled?: boolean
  sponsors: ConferenceSponsor[]
  sponsorTiers: SponsorTierExisting[]
  sponsorsByTier: Record<string, ConferenceSponsor[]>
  sortedTierNames: string[]
}

/**
 * Sponsors grouped by tier. Adding and editing use the board's flow: the
 * create form, then the shared record panel (`?sponsor=<id>&view=<tab>`).
 */
export function SponsorTierManagement({
  conference,
  domain,
  canSendDiscountCodes = false,
  workshopsEnabled = false,
  sponsors,
  sponsorTiers,
  sponsorsByTier,
  sortedTierNames,
}: SponsorManagementProps) {
  const router = useRouter()
  const panel = useSponsorRecordPanel({ viewParam: 'view', idParam: 'sponsor' })
  const refreshSponsor = useRefreshSponsor()
  // `undefined`: closed; `''`: open with no tier chosen.
  const [createTierId, setCreateTierId] = useState<string | undefined>()
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean
    sponsorName: string
    sfcId: string
  }>({ isOpen: false, sponsorName: '', sfcId: '' })
  const { showNotification } = useNotification()

  const removeSponsorMutation = api.sponsor.crm.delete.useMutation({
    onSuccess: () => {
      showNotification({
        type: 'success',
        title: 'Sponsor removed',
        message: 'Sponsor has been successfully removed from the conference.',
      })
      router.refresh()
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Failed to remove sponsor',
        message: error.message,
      })
    },
  })

  const openAddModal = (tierId?: string) => setCreateTierId(tierId ?? '')

  const openEditModal = (sponsor: ConferenceSponsor) => {
    if (sponsor._sfcId) panel.open(sponsor._sfcId)
  }

  const handleRemoveSponsor = async (sponsorName: string, sfcId: string) => {
    setConfirmationModal({
      isOpen: true,
      sponsorName,
      sfcId,
    })
  }

  const confirmRemoveSponsor = async () => {
    const { sfcId } = confirmationModal
    setConfirmationModal({ isOpen: false, sponsorName: '', sfcId: '' })
    try {
      await removeSponsorMutation.mutateAsync({ id: sfcId })
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
                    const sfcId = sponsorData._sfcId || ''

                    return (
                      <div
                        key={`${sponsor.name}-${index}`}
                        className="group relative rounded-lg border border-gray-300 bg-white p-4 shadow-sm hover:border-gray-400 sm:p-6 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500"
                      >
                        <div className="absolute top-2 right-2 flex space-x-1 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:opacity-0">
                          {sponsor.logo && (
                            <button
                              onClick={() =>
                                handleDownloadSvg(sponsor.name, sponsor.logo!)
                              }
                              className="rounded-md bg-blue-50 p-2 text-blue-600 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-blue-900/50 dark:text-blue-400 dark:hover:bg-blue-900"
                              aria-label="Download SVG logo"
                              title="Download SVG logo"
                            >
                              <ArrowDownTrayIcon className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(sponsorData)}
                            className="rounded-md bg-indigo-50 p-2 text-indigo-600 hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400 dark:hover:bg-indigo-900"
                            aria-label="Edit sponsor"
                            title="Edit sponsor"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              handleRemoveSponsor(sponsor.name, sfcId)
                            }
                            disabled={removeSponsorMutation.isPending}
                            className="rounded-md bg-red-50 p-2 text-red-600 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-900/50 dark:text-red-400 dark:hover:bg-red-900"
                            aria-label="Remove sponsor"
                            title="Remove sponsor"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="flex items-start space-x-4">
                          <div className="shrink-0">
                            {sponsor.logo ? (
                              <SponsorLogo
                                logo={sponsor.logo}
                                logoBright={sponsor.logoBright}
                                name={sponsor.name}
                                style={ADMIN_LOGO_SIZE}
                                className="flex h-12 w-12 items-center justify-center"
                              />
                            ) : (
                              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 p-1 text-center text-[10px] font-bold break-words text-gray-400 uppercase dark:bg-gray-700">
                                {sponsor.name}
                              </div>
                            )}
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

      {createTierId !== undefined && (
        <SponsorCRMForm
          conferenceId={conference._id}
          workshopsEnabled={workshopsEnabled}
          sponsorStartSet={!!conference.workshopRegistrationSponsorStart}
          sponsor={null}
          isOpen
          initialTierId={createTierId || undefined}
          onClose={() => setCreateTierId(undefined)}
          // A new sponsor continues in the side panel, as on the board.
          onSuccess={(createdId) => {
            if (createdId) {
              setCreateTierId(undefined)
              router.refresh()
              panel.open(createdId, 'pipeline')
            }
          }}
          existingSponsorsInCRM={sponsors.map((s) => s.sponsor._id)}
        />
      )}
      {panel.id && (
        <SponsorRecordPanel
          sponsorId={panel.id}
          view={panel.view}
          onViewChange={panel.setView}
          onClose={panel.close}
          onChanged={() => {
            if (panel.id) refreshSponsor(panel.id)
            router.refresh()
          }}
          conference={conference}
          domain={domain}
          canSendDiscountCodes={canSendDiscountCodes}
          workshopsEnabled={workshopsEnabled}
        />
      )}

      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={() =>
          setConfirmationModal({
            isOpen: false,
            sponsorName: '',
            sfcId: '',
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
