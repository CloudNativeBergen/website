'use client'

import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { SponsorLogo } from '@/components/SponsorLogo'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import {
  PencilIcon,
  TrashIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline'
import {
  getInvoiceStatusColor,
  formatInvoiceStatusLabel,
  calculateSponsorValue,
} from './utils'
import clsx from 'clsx'

interface SponsorCardProps {
  sponsor: SponsorForConferenceExpanded
  isSelected?: boolean
  isSelectionMode?: boolean
  onToggleSelect?: (e: React.MouseEvent) => void
  onEdit: () => void
  onDelete: () => void
  onEmail?: () => void
}

export function SponsorCard({
  sponsor,
  isSelected = false,
  isSelectionMode = false,
  onToggleSelect,
  onEdit,
  onDelete,
  onEmail,
}: SponsorCardProps) {
  const { value, currency } = calculateSponsorValue(sponsor)

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDelete()
  }

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onEdit()
  }

  const handleEmailClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onEmail?.()
  }

  const handleSelectClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleSelect?.(e)
  }

  const handleCardClick = (e: React.MouseEvent) => {
    if (isSelectionMode) {
      onToggleSelect?.(e)
    } else {
      onEdit()
    }
  }

  return (
    <div
      className={clsx(
        'group relative cursor-pointer rounded border p-2 transition-all hover:border-brand-cloud-blue hover:shadow-md dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500',
        isSelected
          ? 'border-indigo-500 bg-indigo-50/30 shadow-sm ring-1 ring-indigo-500 dark:border-indigo-400 dark:bg-indigo-900/20'
          : 'border-gray-200 bg-white',
      )}
      onClick={handleCardClick}
    >
      {/* Selection Checkbox */}
      <div
        className={clsx(
          'absolute top-1 left-1 z-20 transition-opacity',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        onClick={handleSelectClick}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}} // Handled by parent click
          className="h-4 w-4 cursor-pointer rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700"
        />
      </div>

      {/* Assignee Avatar - Top Left (Offset if checkbox is visible) */}
      {sponsor.assigned_to && (
        <div
          className={clsx(
            'absolute top-1 left-1 z-10 origin-top-left scale-75 transition-transform',
            isSelected && 'translate-x-5', // Move avatar right when selected
            'group-hover:translate-x-5', // Move avatar right on hover to make room for checkbox
          )}
        >
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

      {/* Action Buttons */}
      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {onEmail && (
          <button
            onClick={handleEmailClick}
            className="cursor-pointer rounded bg-white/90 p-0.5 shadow-sm hover:bg-blue-50 dark:bg-gray-700/90 dark:hover:bg-gray-600"
            title="Email Sponsor"
          >
            <EnvelopeIcon className="h-3 w-3 text-brand-cloud-blue dark:text-blue-400" />
          </button>
        )}
        <button
          onClick={handleEditClick}
          className="cursor-pointer rounded bg-white/90 p-0.5 shadow-sm hover:bg-gray-50 dark:bg-gray-700/90 dark:hover:bg-gray-600"
          title="Edit"
        >
          <PencilIcon className="h-3 w-3 text-brand-cloud-blue dark:text-blue-400" />
        </button>
        <button
          onClick={handleDeleteClick}
          className="cursor-pointer rounded bg-white/90 p-0.5 shadow-sm hover:bg-red-50 dark:bg-gray-700/90 dark:hover:bg-red-900"
          title="Delete"
        >
          <TrashIcon className="h-3 w-3 text-red-600 dark:text-red-400" />
        </button>
      </div>

      {/* Logo */}
      <div className="mb-1.5 flex h-8 items-center justify-center overflow-hidden">
        {sponsor.sponsor.logo ? (
          <SponsorLogo
            logo={sponsor.sponsor.logo}
            logoBright={sponsor.sponsor.logo_bright}
            name={sponsor.sponsor.name}
            className="max-h-full w-auto max-w-20 object-contain"
          />
        ) : (
          <span className="truncate px-1 text-center text-[10px] font-bold text-gray-500 uppercase">
            {sponsor.sponsor.name}
          </span>
        )}
      </div>

      {/* Priority Tags */}
      {sponsor.tags?.some((t) =>
        ['high-priority', 'needs-follow-up', 'returning-sponsor'].includes(t),
      ) && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {sponsor.tags.includes('high-priority') && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 uppercase dark:bg-red-900/30 dark:text-red-400">
              High Priority
            </span>
          )}
          {sponsor.tags.includes('needs-follow-up') && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 uppercase dark:bg-amber-900/30 dark:text-amber-400">
              Needs Follow-up
            </span>
          )}
          {sponsor.tags.includes('returning-sponsor') && (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 uppercase dark:bg-emerald-900/30 dark:text-emerald-400">
              Returning
            </span>
          )}
        </div>
      )}

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

      {/* Invoice Status */}
      {value > 0 && (
        <div className="flex items-center gap-1">
          <span
            className={clsx(
              'inline-flex flex-1 items-center justify-center rounded px-1.5 py-0.5 text-xs font-medium',
              getInvoiceStatusColor(sponsor.invoice_status),
            )}
          >
            {formatInvoiceStatusLabel(sponsor.invoice_status)}
          </span>
        </div>
      )}
    </div>
  )
}
