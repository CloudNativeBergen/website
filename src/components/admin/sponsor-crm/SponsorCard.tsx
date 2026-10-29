'use client'

import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { SponsorLogo } from '@/components/SponsorLogo'
import { formatNumber } from '@/lib/format'
import {
  ExclamationTriangleIcon,
  EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline'
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react'
import {
  formatInvoiceStatusLabel,
  formatStatusName,
  calculateSponsorValue,
  getDaysPending,
  checkSponsorNeedsFollowUp,
  getDaysInactive,
} from './utils'
import type { CrmActivityThreshold } from '@/lib/conference/types'
import { isInvoicePastDue } from '@/lib/sponsor-crm/invoice'
import { formatConferenceDate, osloTodayDateString } from '@/lib/time'
import { useNotification } from '@/components/admin/NotificationProvider'
import clsx from 'clsx'
import { BoardView } from './BoardViewSwitcher'
import { useDraggable } from '@dnd-kit/core'

interface SponsorCardProps {
  sponsor: SponsorForConferenceExpanded
  currentView: BoardView
  columnKey?: string
  isSelected?: boolean
  isSelectionMode?: boolean
  thresholds?: CrmActivityThreshold[]
  onToggleSelect?: () => void
  onEdit: () => void
  onEmail?: () => void
}

const STALE_DAYS = 7

const SIGNATURE_LABELS = {
  pending: 'Awaiting signature',
  signed: 'Signed',
  rejected: 'Signature rejected',
  expired: 'Signature expired',
} as const

const shortDate = (date: string) =>
  formatConferenceDate(date, { day: 'numeric', month: 'short' })

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')

const formatValue = (v: number) =>
  v >= 1000000
    ? `${(v / 1000000).toFixed(1)}M`
    : v >= 1000
      ? `${(v / 1000).toFixed(0)}K`
      : formatNumber(v)

/**
 * The single status line under the card's value row. Each board answers its
 * own question: when do we talk next (pipeline), is the contract signed
 * (contract), is the invoice paid on time (invoice).
 */
export function getCardStatus(
  sponsor: SponsorForConferenceExpanded,
  view: BoardView,
  thresholds?: CrmActivityThreshold[],
): { text: string; overdue: boolean; warning: boolean } {
  const inactive = getDaysInactive(sponsor)
  // Same stale rules as the board's follow-up flag and the action items
  // ("Stale Negotiation": contacted/negotiating with 7+ days of silence).
  const warning =
    checkSponsorNeedsFollowUp(sponsor, thresholds) ||
    (['contacted', 'negotiating'].includes(sponsor.status) &&
      inactive !== null &&
      inactive >= STALE_DAYS)

  if (view === 'contract') {
    const sig = sponsor.signatureStatus
    const signed =
      sig === 'signed' || sponsor.contractStatus === 'contract-signed'
    const label =
      sig && sig !== 'not-started'
        ? SIGNATURE_LABELS[sig]
        : !sponsor.contractStatus || sponsor.contractStatus === 'none'
          ? 'No contract yet'
          : formatStatusName(sponsor.contractStatus)
    const waiting = signed ? null : getDaysPending(sponsor.contractSentAt)
    return {
      text: waiting === null ? label : `${label} · waiting ${days(waiting)}`,
      overdue: false,
      warning,
    }
  }

  if (view === 'invoice') {
    if (isInvoicePastDue(sponsor)) {
      return {
        text: `Overdue since ${shortDate(sponsor.invoiceDueAt!)}`,
        overdue: true,
        warning,
      }
    }
    if (sponsor.invoiceDueAt && sponsor.invoiceStatus === 'sent') {
      return {
        text: `Due ${shortDate(sponsor.invoiceDueAt)}`,
        overdue: false,
        warning,
      }
    }
    return {
      text: formatInvoiceStatusLabel(sponsor.invoiceStatus),
      overdue: false,
      warning,
    }
  }

  if (sponsor.nextFollowUpAt) {
    const overdue = sponsor.nextFollowUpAt.slice(0, 10) < osloTodayDateString()
    return {
      text: `Follow up ${shortDate(sponsor.nextFollowUpAt)}`,
      overdue,
      warning,
    }
  }
  if (inactive === null)
    return { text: 'No activity yet', overdue: false, warning }
  return {
    text:
      inactive === 0 ? 'In contact today' : `No contact for ${days(inactive)}`,
    overdue: false,
    warning,
  }
}

const MENU_ITEM =
  'block w-full px-4 py-2 text-left text-sm text-gray-700 data-[focus]:bg-gray-100 dark:text-gray-300 dark:data-[focus]:bg-gray-700'

export function SponsorCard({
  sponsor,
  currentView,
  columnKey,
  isSelected = false,
  isSelectionMode = false,
  thresholds,
  onToggleSelect,
  onEdit,
  onEmail,
}: SponsorCardProps) {
  const { showNotification } = useNotification()
  const { value, currency } = calculateSponsorValue(sponsor)
  const needsFollowUp = checkSponsorNeedsFollowUp(sponsor, thresholds)
  const status = getCardStatus(sponsor, currentView, thresholds)
  const name = sponsor.sponsor.name
  const owner = sponsor.assignedTo

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: sponsor._id,
    data: {
      type: 'sponsor',
      sponsor,
      sourceColumnKey: columnKey,
    },
    disabled: isSelectionMode || !columnKey,
  })

  const open = () => (isSelectionMode ? onToggleSelect?.() : onEdit())

  const copyLink = async () => {
    const url = `${window.location.origin}/admin/sponsors/crm?sponsor=${encodeURIComponent(sponsor._id)}&view=pipeline`
    try {
      await navigator.clipboard.writeText(url)
      showNotification({ type: 'success', title: 'Link copied' })
    } catch {
      showNotification({ type: 'error', title: 'Could not copy the link' })
    }
  }

  // Keeps clicks, key presses and pointer-downs inside the checkbox and menu
  // from opening the sponsor or starting a drag.
  const stop = {
    onClick: (e: React.SyntheticEvent) => e.stopPropagation(),
    onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
    onKeyDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={`${name}, ${status.text}`}
      aria-pressed={isSelectionMode ? isSelected : undefined}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault()
          open()
          return
        }
        listeners?.onKeyDown?.(e)
      }}
      className={clsx(
        'group relative flex cursor-pointer flex-col gap-1 rounded-lg border py-2 pr-2 pl-3 transition-colors hover:shadow-md focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none',
        columnKey && !isSelectionMode && 'active:cursor-grabbing',
        isSelected
          ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500 dark:border-indigo-400 dark:bg-indigo-950/40 dark:ring-indigo-400'
          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-500',
        needsFollowUp
          ? 'border-l-4 border-l-amber-500'
          : 'border-l-[3px] border-l-gray-400 dark:border-l-gray-500',
        isDragging && 'opacity-30',
      )}
    >
      {/* Line 1: logo + name */}
      <div className="flex items-center gap-2 pr-12">
        <div className="flex h-6 w-10 shrink-0 items-center justify-center overflow-hidden">
          {sponsor.sponsor.logo ? (
            <SponsorLogo
              logo={sponsor.sponsor.logo}
              logoBright={sponsor.sponsor.logoBright}
              name={name}
              className="max-h-full w-auto max-w-10 object-contain"
            />
          ) : (
            <span className="text-[10px] font-bold text-gray-500 uppercase dark:text-gray-400">
              {initials(name)}
            </span>
          )}
        </div>
        <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
          {name}
        </p>
      </div>

      {/* Line 2: value · tier · owner */}
      <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
        {value > 0 && (
          <span className="shrink-0 font-semibold text-gray-900 dark:text-white">
            {formatValue(value)} {currency}
          </span>
        )}
        {value > 0 && sponsor.tier && <span aria-hidden="true">·</span>}
        {sponsor.tier && <span className="truncate">{sponsor.tier.title}</span>}
        <span className="ml-auto shrink-0">
          {owner ? (
            owner.image ? (
              <img
                src={owner.image}
                alt={owner.name}
                title={owner.name}
                className="h-5 w-5 rounded-full object-cover"
              />
            ) : (
              <span
                title={owner.name}
                aria-label={owner.name}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-[9px] font-semibold text-gray-700 dark:bg-gray-600 dark:text-gray-100"
              >
                {initials(owner.name)}
              </span>
            )
          ) : (
            <span className="text-gray-400 dark:text-gray-500">No owner</span>
          )}
        </span>
      </div>

      {/* Line 3: board status */}
      <p
        className={clsx(
          'flex items-center gap-1 truncate text-xs',
          status.overdue
            ? 'font-medium text-red-600 dark:text-red-400'
            : 'text-gray-500 dark:text-gray-400',
        )}
      >
        {status.warning && (
          <ExclamationTriangleIcon
            className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400"
            aria-label="Needs attention"
          />
        )}
        <span className="truncate">{status.text}</span>
      </p>

      {/* Selection checkbox */}
      <div
        className={clsx(
          'absolute top-1 left-1 z-10 leading-none transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 focus-within:opacity-100',
          isSelected || isSelectionMode ? 'opacity-100' : 'opacity-0',
        )}
        {...stop}
      >
        <input
          type="checkbox"
          aria-label={`Select ${name}`}
          checked={isSelected}
          onChange={() => onToggleSelect?.()}
          className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700"
        />
      </div>

      {/* Options menu */}
      <div className="absolute top-1 right-1" {...stop}>
        <Menu>
          <MenuButton
            aria-label={`Options for ${name}`}
            className="flex items-center rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 sm:p-1 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <EllipsisHorizontalIcon className="h-5 w-5" />
          </MenuButton>
          <MenuItems
            anchor="bottom end"
            className="z-50 w-44 rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5 [--anchor-gap:4px] focus:outline-none dark:bg-gray-800 dark:ring-white/10"
          >
            {onEmail && (
              <MenuItem>
                <button onClick={onEmail} className={MENU_ITEM}>
                  Send email
                </button>
              </MenuItem>
            )}
            <MenuItem>
              <button onClick={copyLink} className={MENU_ITEM}>
                Copy link
              </button>
            </MenuItem>
            <MenuItem>
              <a
                href={`/admin/sponsors/${encodeURIComponent(sponsor._id)}`}
                className={MENU_ITEM}
              >
                Open sponsor page
              </a>
            </MenuItem>
          </MenuItems>
        </Menu>
      </div>
    </div>
  )
}
