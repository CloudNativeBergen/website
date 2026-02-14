'use client'

import type {
  SponsorForConferenceExpanded,
  SponsorTag,
  SignatureStatus,
} from '@/lib/sponsor-crm/types'
import type { Speaker } from '@/lib/speaker/types'
import { SponsorLogo } from '@/components/SponsorLogo'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import {
  PencilIcon,
  TrashIcon,
  EnvelopeIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'
import {
  getInvoiceStatusColor,
  formatInvoiceStatusLabel,
  calculateSponsorValue,
  getSignatureStatusBadgeProps,
  getDaysPending,
} from './utils'
import clsx from 'clsx'
import { BoardView } from './BoardViewSwitcher'
import { useDraggable } from '@dnd-kit/core'

interface SponsorCardProps {
  sponsor: SponsorForConferenceExpanded
  currentView: BoardView
  columnKey?: string
  isSelected?: boolean
  isSelectionMode?: boolean
  onToggleSelect?: (e: React.MouseEvent) => void
  onEdit: () => void
  onDelete: () => void
  onEmail?: () => void
  onContract?: () => void
}

const TAG_BADGES: {
  tag: SponsorTag
  label: string
  classes: string
}[] = [
    {
      tag: 'high-priority',
      label: 'PRI',
      classes:
        'bg-red-100 text-red-700 ring-red-700/20 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-400/20',
    },
    {
      tag: 'needs-follow-up',
      label: 'FUP',
      classes:
        'bg-amber-100 text-amber-700 ring-amber-700/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-400/20',
    },
    {
      tag: 'returning-sponsor',
      label: 'RET',
      classes:
        'bg-emerald-100 text-emerald-700 ring-emerald-700/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-400/20',
    },
  ]

const TAG_TOOLTIPS: Record<string, string> = {
  PRI: 'High Priority',
  FUP: 'Needs Follow-up',
  RET: 'Returning Sponsor',
}

export function SponsorCard({
  sponsor,
  currentView,
  columnKey,
  isSelected = false,
  isSelectionMode = false,
  onToggleSelect,
  onEdit,
  onDelete,
  onEmail,
  onContract,
}: SponsorCardProps) {
  const { value, currency } = calculateSponsorValue(sponsor)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: sponsor._id,
    data: {
      type: 'sponsor',
      sponsor,
      sourceColumnKey: columnKey,
    },
    disabled: isSelectionMode || !columnKey,
  })

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

  const handleContractClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onContract?.()
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

  const activeTags = TAG_BADGES.filter((t) => sponsor.tags?.includes(t.tag))

  const formatValue = (v: number) =>
    v >= 1000000
      ? `${(v / 1000000).toFixed(1)}M`
      : v >= 1000
        ? `${(v / 1000).toFixed(0)}K`
        : v.toLocaleString()

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'group relative flex cursor-grab gap-3 overflow-hidden rounded-lg border p-3 transition-all hover:border-brand-cloud-blue hover:shadow-md active:cursor-grabbing dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-500',
        isSelected
          ? 'border-indigo-500 bg-indigo-50/30 shadow-sm ring-1 ring-indigo-500 dark:border-indigo-400 dark:bg-indigo-900/20'
          : 'border-gray-200 bg-white',
        isDragging && 'opacity-30',
      )}
      onClick={handleCardClick}
      {...attributes}
      {...listeners}
    >
      {/* Selection Checkbox */}
      <div
        className={clsx(
          'absolute top-1 left-1 z-20 transition-opacity',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
        onClick={handleSelectClick}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => { }}
          className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700"
        />
      </div>

      {/* Left: Logo + Assignee */}
      <div className="flex w-14 shrink-0 flex-col items-center justify-center gap-1.5">
        {/* Logo */}
        <div className="flex h-9 w-14 items-center justify-center overflow-hidden">
          {sponsor.sponsor.logo ? (
            <SponsorLogo
              logo={sponsor.sponsor.logo}
              logoBright={sponsor.sponsor.logoBright}
              name={sponsor.sponsor.name}
              className="max-h-full w-auto max-w-14 object-contain"
            />
          ) : (
            <span className="truncate text-center text-[10px] leading-tight font-bold text-gray-500 uppercase dark:text-gray-400">
              {sponsor.sponsor.name}
            </span>
          )}
        </div>
        {/* Assignee */}
        {sponsor.assignedTo && (
          <div className="scale-[0.8] transform">
            <SpeakerAvatars
              speakers={[
                {
                  _id: sponsor.assignedTo._id,
                  name: sponsor.assignedTo.name,
                  image: sponsor.assignedTo.image,
                } as Speaker,
              ]}
              size="sm"
              maxVisible={1}
              showTooltip={true}
            />
          </div>
        )}
      </div>

      {/* Right: Name + Value + Tags */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        {/* Name */}
        <p className="truncate text-base leading-snug font-semibold text-gray-900 dark:text-white">
          {sponsor.sponsor.name}
        </p>

        {/* Value */}
        {value > 0 && (
          <div className="flex items-center text-base leading-snug">
            <span className="shrink-0 font-bold text-brand-cloud-blue dark:text-blue-400">
              {formatValue(value)} {currency}
            </span>
          </div>
        )}

        {/* Tags + Invoice status */}
        <div className="flex items-center gap-1">
          {activeTags.map((t) => (
            <span
              key={t.tag}
              title={TAG_TOOLTIPS[t.label]}
              className={clsx(
                'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-none font-bold uppercase ring-1 ring-inset',
                t.classes,
              )}
            >
              {t.label}
            </span>
          ))}
          {value > 0 && currentView !== 'pipeline' && (
            <span
              className={clsx(
                'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-none font-medium whitespace-nowrap',
                getInvoiceStatusColor(sponsor.invoiceStatus),
              )}
            >
              {formatInvoiceStatusLabel(sponsor.invoiceStatus)}
            </span>
          )}
          {currentView === 'contract' &&
            sponsor.signatureStatus &&
            sponsor.signatureStatus !== 'not-started' && (
              <SignatureBadge
                status={sponsor.signatureStatus}
                contractSentAt={sponsor.contractSentAt}
              />
            )}
        </div>
      </div>

      {/* Action Buttons - Top Right */}
      <div
        className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {onContract && (
          <button
            onClick={handleContractClick}
            className="cursor-pointer rounded bg-white/90 p-1 shadow-sm hover:bg-blue-50 dark:bg-gray-700/90 dark:hover:bg-gray-600"
            title="Contract"
          >
            <DocumentTextIcon className="h-3.5 w-3.5 text-brand-cloud-blue dark:text-blue-400" />
          </button>
        )}
        {onEmail && (
          <button
            onClick={handleEmailClick}
            className="cursor-pointer rounded bg-white/90 p-1 shadow-sm hover:bg-blue-50 dark:bg-gray-700/90 dark:hover:bg-gray-600"
            title="Email Sponsor"
          >
            <EnvelopeIcon className="h-3.5 w-3.5 text-brand-cloud-blue dark:text-blue-400" />
          </button>
        )}
        <button
          onClick={handleEditClick}
          className="cursor-pointer rounded bg-white/90 p-1 shadow-sm hover:bg-gray-50 dark:bg-gray-700/90 dark:hover:bg-gray-600"
          title="Edit"
        >
          <PencilIcon className="h-3.5 w-3.5 text-brand-cloud-blue dark:text-blue-400" />
        </button>
        <button
          onClick={handleDeleteClick}
          className="cursor-pointer rounded bg-white/90 p-1 shadow-sm hover:bg-red-50 dark:bg-gray-700/90 dark:hover:bg-red-900"
          title="Delete"
        >
          <TrashIcon className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
        </button>
      </div>
    </div>
  )
}

const SIGNATURE_COLORS: Record<
  Exclude<SignatureStatus, 'not-started'>,
  string
> = {
  pending:
    'bg-yellow-100 text-yellow-700 ring-yellow-700/20 dark:bg-yellow-900/30 dark:text-yellow-400 dark:ring-yellow-400/20',
  signed:
    'bg-green-100 text-green-700 ring-green-700/20 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-400/20',
  rejected:
    'bg-red-100 text-red-700 ring-red-700/20 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-400/20',
  expired:
    'bg-orange-100 text-orange-700 ring-orange-700/20 dark:bg-orange-900/30 dark:text-orange-400 dark:ring-orange-400/20',
}

function SignatureBadge({
  status,
  contractSentAt,
}: {
  status: SignatureStatus
  contractSentAt?: string
}) {
  const { label } = getSignatureStatusBadgeProps(status)
  const days = getDaysPending(contractSentAt)
  const colorClass =
    SIGNATURE_COLORS[status as keyof typeof SIGNATURE_COLORS] ??
    SIGNATURE_COLORS.pending

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] leading-none font-bold whitespace-nowrap ring-1 ring-inset',
        colorClass,
      )}
      title={days != null ? `Sent ${days}d ago` : undefined}
    >
      {label}
      {status === 'pending' && days != null && days > 0 && (
        <span className="ml-0.5 font-normal">({days}d)</span>
      )}
    </span>
  )
}
