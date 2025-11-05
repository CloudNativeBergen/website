'use client'

import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { SponsorLogo } from '@/components/SponsorLogo'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'
import {
  getInvoiceStatusColor,
  formatInvoiceStatusLabel,
  calculateSponsorValue,
} from './utils'
import clsx from 'clsx'

interface SponsorCardProps {
  sponsor: SponsorForConferenceExpanded
  onEdit: () => void
  onDelete: () => void
}

export function SponsorCard({ sponsor, onEdit, onDelete }: SponsorCardProps) {
  const { value, currency } = calculateSponsorValue(sponsor)

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete()
  }

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onEdit()
  }

  return (
    <div
      className="group relative cursor-pointer rounded border border-gray-200 bg-white p-2 transition-all hover:border-brand-cloud-blue hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500"
      onClick={onEdit}
    >
      {/* Action Buttons */}
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={handleEditClick}
          className="rounded bg-white/90 p-0.5 shadow-sm hover:bg-gray-50 dark:bg-gray-700/90 dark:hover:bg-gray-600"
          title="Edit"
        >
          <PencilIcon className="h-3 w-3 text-brand-cloud-blue dark:text-blue-400" />
        </button>
        <button
          onClick={handleDeleteClick}
          className="rounded bg-white/90 p-0.5 shadow-sm hover:bg-red-50 dark:bg-gray-700/90 dark:hover:bg-red-900"
          title="Delete"
        >
          <TrashIcon className="h-3 w-3 text-red-600 dark:text-red-400" />
        </button>
      </div>

      {/* Logo */}
      <div className="mb-1.5 flex h-8 items-center justify-center overflow-hidden">
        <SponsorLogo
          logo={sponsor.sponsor.logo}
          logoBright={sponsor.sponsor.logo_bright}
          name={sponsor.sponsor.name}
          className="max-h-full w-auto max-w-20 object-contain"
        />
      </div>

      {/* Value & Tier */}
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

      {/* Invoice Status & Assignee */}
      {value > 0 ? (
        <div className="flex items-center justify-between gap-1">
          <span
            className={clsx(
              'inline-flex flex-1 items-center justify-center rounded px-1.5 py-0.5 text-xs font-medium',
              getInvoiceStatusColor(sponsor.invoice_status),
            )}
          >
            {formatInvoiceStatusLabel(sponsor.invoice_status)}
          </span>
          {sponsor.assigned_to && (
            <div className="scale-75">
              <SpeakerAvatars
                speakers={[
                  {
                    _id: sponsor.assigned_to._id,
                    _rev: '',
                    _createdAt: '',
                    _updatedAt: '',
                    name: sponsor.assigned_to.name,
                    email: sponsor.assigned_to.email,
                    image: sponsor.assigned_to.image,
                  },
                ]}
                size="sm"
                maxVisible={1}
                showTooltip={true}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-end gap-1">
          {sponsor.assigned_to && (
            <div className="scale-75">
              <SpeakerAvatars
                speakers={[
                  {
                    _id: sponsor.assigned_to._id,
                    _rev: '',
                    _createdAt: '',
                    _updatedAt: '',
                    name: sponsor.assigned_to.name,
                    email: sponsor.assigned_to.email,
                    image: sponsor.assigned_to.image,
                  },
                ]}
                size="sm"
                maxVisible={1}
                showTooltip={true}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
