'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ConferenceSponsorDetailed } from '@/lib/sponsor/types'
import {
  BuildingOffice2Icon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'

interface SponsorCardProps {
  sponsor: ConferenceSponsorDetailed
  isDragging?: boolean
}

export default function SponsorCard({
  sponsor,
  isDragging = false,
}: SponsorCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: sponsor.sponsor._id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Get status color for the card
  const getStatusColor = (status?: string): string => {
    if (!status) return 'border-gray-300 bg-gray-50'

    switch (status) {
      case 'confirmed':
      case 'paid':
      case 'completed':
      case 'fulfilled':
        return 'border-green-300 bg-green-50'
      case 'potential':
      case 'contacted':
      case 'dialog':
        return 'border-blue-300 bg-blue-50'
      case 'declined':
      case 'cancelled':
        return 'border-red-300 bg-red-50'
      case 'invoice_overdue':
        return 'border-red-400 bg-red-100'
      case 'negotiating':
      case 'proposal_sent':
        return 'border-yellow-300 bg-yellow-50'
      case 'contract_sent':
      case 'contract_signed':
        return 'border-purple-300 bg-purple-50'
      case 'invoice_pending':
      case 'invoice_sent':
      case 'partial_paid':
        return 'border-green-400 bg-green-100'
      default:
        return 'border-gray-300 bg-gray-50'
    }
  }

  // Get status badge style
  const getStatusBadge = (status?: string) => {
    if (!status) return 'bg-gray-100 text-gray-800'

    switch (status) {
      case 'confirmed':
      case 'paid':
      case 'completed':
      case 'fulfilled':
        return 'bg-green-100 text-green-800'
      case 'potential':
      case 'contacted':
      case 'dialog':
        return 'bg-blue-100 text-blue-800'
      case 'declined':
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      case 'invoice_overdue':
        return 'bg-red-200 text-red-900'
      case 'negotiating':
      case 'proposal_sent':
        return 'bg-yellow-100 text-yellow-800'
      case 'contract_sent':
      case 'contract_signed':
        return 'bg-purple-100 text-purple-800'
      case 'invoice_pending':
      case 'invoice_sent':
      case 'partial_paid':
        return 'bg-green-200 text-green-900'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const currentStatus = sponsor.sponsor.relationship?.current_status
  const contactCount = sponsor.sponsor.contact_persons?.length || 0
  const hasInvoice = !!sponsor.sponsor.invoice
  const tierTitle = sponsor.tier?.title || 'No Tier'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`cursor-grab rounded-lg border-2 p-4 transition-all duration-200 hover:shadow-md active:cursor-grabbing ${getStatusColor(currentStatus)} ${isDragging || isSortableDragging ? 'rotate-2 opacity-90 shadow-lg' : ''} `}
      {...attributes}
      {...listeners}
    >
      {/* Sponsor Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex min-w-0 flex-1 items-center space-x-2">
          <BuildingOffice2Icon className="h-5 w-5 flex-shrink-0 text-gray-500" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold text-gray-900">
              {sponsor.sponsor.name}
            </h3>
            <p className="truncate text-sm text-gray-600">{tierTitle}</p>
          </div>
        </div>
      </div>

      {/* Status Badge */}
      <div className="mb-3">
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${getStatusBadge(
            currentStatus,
          )}`}
        >
          {currentStatus ? currentStatus.replace(/_/g, ' ') : 'No Status'}
        </span>
      </div>

      {/* Sponsor Details */}
      <div className="space-y-2">
        {/* Contact Info */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-1">
            <UserGroupIcon className="h-4 w-4 text-gray-400" />
            <span className="text-gray-600">
              {contactCount} contact{contactCount !== 1 ? 's' : ''}
            </span>
          </div>
          {contactCount > 0 ? (
            <CheckCircleIcon className="h-4 w-4 text-green-500" />
          ) : (
            <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />
          )}
        </div>

        {/* Invoice Status */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center space-x-1">
            <CurrencyDollarIcon className="h-4 w-4 text-gray-400" />
            <span className="text-gray-600">
              {hasInvoice ? 'Invoice created' : 'No invoice'}
            </span>
          </div>
          {hasInvoice ? (
            <CheckCircleIcon className="h-4 w-4 text-green-500" />
          ) : (
            <div className="h-4 w-4" />
          )}
        </div>

        {/* Tier Info */}
        {sponsor.tier?.price && sponsor.tier.price.length > 0 && (
          <div className="text-sm text-gray-600">
            <span className="font-medium">
              {sponsor.tier.price[0].currency}{' '}
              {sponsor.tier.price[0].amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
            </span>
          </div>
        )}
      </div>

      {/* Website Link */}
      <div className="mt-3 border-t border-gray-200 pt-3">
        <a
          href={sponsor.sponsor.website}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-xs text-blue-600 hover:text-blue-800"
          onClick={(e) => e.stopPropagation()}
        >
          {sponsor.sponsor.website}
        </a>
      </div>
    </div>
  )
}
