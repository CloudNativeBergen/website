'use client'

import { api } from '@/lib/trpc/client'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { formatCurrency } from '@/lib/format'
import {
  getInvoiceStatusColor,
  formatInvoiceStatusLabel,
} from '@/components/admin/sponsor-crm/utils'
import { SponsorLogo } from '@/components/SponsorLogo'
import clsx from 'clsx'
import { useState } from 'react'
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import { SponsorCRMForm } from '@/components/admin/sponsor-crm/SponsorCRMForm'

interface SponsorCRMClientProps {
  conferenceId: string
}

export function SponsorCRMClient({ conferenceId }: SponsorCRMClientProps) {
  const [selectedSponsor, setSelectedSponsor] =
    useState<SponsorForConferenceExpanded | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)

  const { data: sponsors = [], isLoading } = api.sponsor.crm.list.useQuery({
    conferenceId,
  })

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

  const sponsorsByStatus = sponsors.reduce(
    (acc, sponsor) => {
      if (!acc[sponsor.status]) {
        acc[sponsor.status] = []
      }
      acc[sponsor.status].push(sponsor)
      return acc
    },
    {} as Record<string, SponsorForConferenceExpanded[]>,
  )

  const statuses: Array<{
    key: string
    label: string
  }> = [
    { key: 'prospect', label: 'Prospect' },
    { key: 'contacted', label: 'Contacted' },
    { key: 'negotiating', label: 'Negotiating' },
    { key: 'closed-won', label: 'Closed - Won' },
    { key: 'closed-lost', label: 'Closed - Lost' },
  ]

  const calculateValue = (sponsor: SponsorForConferenceExpanded): number => {
    if (sponsor.contract_value) return sponsor.contract_value
    if (sponsor.tier?.price?.[0]?.amount) return sponsor.tier.price[0].amount
    return 0
  }

  const calculateTotalValue = (
    sponsors: SponsorForConferenceExpanded[],
  ): number => {
    return sponsors.reduce((sum, sponsor) => sum + calculateValue(sponsor), 0)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-brand-slate-gray dark:text-gray-400">
          Loading sponsors...
        </div>
      </div>
    )
  }

  const handleOpenForm = (sponsor?: SponsorForConferenceExpanded) => {
    setSelectedSponsor(sponsor || null)
    setIsFormOpen(true)
  }

  const handleCloseForm = () => {
    setSelectedSponsor(null)
    setIsFormOpen(false)
  }

  return (
    <div className="space-y-4">
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

      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenForm()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-cloud-blue px-4 py-2 text-sm font-medium text-white hover:bg-brand-cloud-blue-hover dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            <PlusIcon className="h-4 w-4" />
            Add Sponsor
          </button>
        </div>
      </div>

      {/* Compact Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {statuses.map((status) => {
          const statusSponsors = sponsorsByStatus[status.key] || []
          const totalValue = calculateTotalValue(statusSponsors)
          const currency =
            statusSponsors[0]?.contract_currency ||
            statusSponsors[0]?.tier?.price?.[0]?.currency ||
            'NOK'

          return (
            <div
              key={status.key}
              className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="text-xs font-medium text-brand-slate-gray dark:text-gray-400">
                {status.label}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-semibold text-brand-cloud-blue dark:text-blue-400">
                  {statusSponsors.length}
                </span>
                {totalValue > 0 && (
                  <span className="text-xs text-brand-slate-gray dark:text-gray-400">
                    {totalValue >= 1000000
                      ? `${(totalValue / 1000000).toFixed(1)}M ${currency}`
                      : totalValue >= 1000
                        ? `${(totalValue / 1000).toFixed(0)}K ${currency}`
                        : formatCurrency(totalValue, currency)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Pipeline Columns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {statuses.map((status) => {
          const statusSponsors = sponsorsByStatus[status.key] || []

          return (
            <div key={status.key} className="flex flex-col">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-brand-cloud-blue dark:text-blue-400">
                  {status.label}
                </h3>
                <span className="rounded-full bg-brand-cloud-blue px-2 py-1 text-xs text-white dark:bg-blue-600">
                  {statusSponsors.length}
                </span>
              </div>
              <div className="space-y-3">
                {statusSponsors
                  .sort((a, b) => calculateValue(b) - calculateValue(a))
                  .map((sponsor) => {
                    const value = calculateValue(sponsor)
                    const currency =
                      sponsor.contract_currency ||
                      sponsor.tier?.price?.[0]?.currency ||
                      'NOK'

                    return (
                      <div
                        key={sponsor._id}
                        className="group relative cursor-pointer rounded border border-gray-200 bg-white p-2 transition-all hover:border-brand-cloud-blue hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500"
                        onClick={() => handleOpenForm(sponsor)}
                      >
                        {/* Action Buttons - Show on hover */}
                        <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleOpenForm(sponsor)
                            }}
                            className="rounded bg-white/90 p-0.5 shadow-sm hover:bg-gray-50 dark:bg-gray-700/90 dark:hover:bg-gray-600"
                            title="Edit"
                          >
                            <PencilIcon className="h-3 w-3 text-brand-cloud-blue dark:text-blue-400" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(sponsor._id)
                            }}
                            className="rounded bg-white/90 p-0.5 shadow-sm hover:bg-red-50 dark:bg-gray-700/90 dark:hover:bg-red-900"
                            title="Delete"
                          >
                            <TrashIcon className="h-3 w-3 text-red-600 dark:text-red-400" />
                          </button>
                        </div>

                        {/* Logo */}
                        <div className="mb-1.5 flex h-8 items-center justify-center">
                          <SponsorLogo
                            logo={sponsor.sponsor.logo}
                            logoBright={sponsor.sponsor.logo_bright}
                            name={sponsor.sponsor.name}
                            className="h-full w-auto max-w-20 object-contain"
                          />
                        </div>

                        {/* Value & Tier in one line */}
                        <div className="mb-1 flex items-center justify-between gap-1 text-xs">
                          {value > 0 && (
                            <span className="font-semibold text-brand-cloud-blue dark:text-blue-400">
                              {value >= 1000000
                                ? `${(value / 1000000).toFixed(1)}M`
                                : value >= 1000
                                  ? `${(value / 1000).toFixed(0)}K`
                                  : value.toLocaleString()}{' '}
                              {currency}
                            </span>
                          )}
                          {sponsor.tier && (
                            <span className="truncate text-brand-slate-gray dark:text-gray-400">
                              {sponsor.tier.title}
                            </span>
                          )}
                        </div>

                        {/* Invoice Status - Compact */}
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={clsx(
                              'inline-flex flex-1 items-center justify-center rounded px-1.5 py-0.5 text-xs font-medium',
                              getInvoiceStatusColor(sponsor.invoice_status),
                            )}
                          >
                            {formatInvoiceStatusLabel(sponsor.invoice_status)}
                          </span>
                          {/* Assigned To - Just initial */}
                          {sponsor.assigned_to && (
                            <span
                              className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-cloud-blue text-xs font-medium text-white dark:bg-blue-600"
                              title={sponsor.assigned_to.name}
                            >
                              {sponsor.assigned_to.name.charAt(0)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                {statusSponsors.length === 0 && (
                  <div className="rounded-lg border-2 border-dashed border-gray-300 p-4 text-center text-sm text-brand-slate-gray dark:border-gray-600 dark:text-gray-400">
                    No sponsors
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
