'use client'

import { useMemo } from 'react'
import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { SponsorCard } from './SponsorCard'
import { PlusIcon } from '@heroicons/react/24/outline'
import { useExchangeRates } from '@/hooks/useExchangeRates'
import { calculateSponsorValue } from './utils'
import { BoardView } from './BoardViewSwitcher'
import { useDroppable } from '@dnd-kit/core'
import clsx from 'clsx'

interface SponsorBoardColumnProps {
  columnKey: string
  title: string
  sponsors: SponsorForConferenceExpanded[]
  isLoading?: boolean
  currentView: BoardView
  selectedIds?: string[]
  isSelectionMode?: boolean
  onSponsorClick: (sponsor: SponsorForConferenceExpanded) => void
  onSponsorDelete: (sponsorId: string) => void
  onSponsorEmail?: (sponsor: SponsorForConferenceExpanded) => void
  onSponsorToggleSelect?: (id: string) => void
  onAddClick: () => void
}

export function SponsorBoardColumn({
  columnKey,
  title,
  sponsors,
  isLoading = false,
  currentView,
  selectedIds = [],
  isSelectionMode = false,
  onSponsorClick,
  onSponsorDelete,
  onSponsorEmail,
  onSponsorToggleSelect,
  onAddClick,
}: SponsorBoardColumnProps) {
  const { convertCurrency } = useExchangeRates()

  const { setNodeRef, isOver } = useDroppable({
    id: columnKey,
    data: {
      type: 'column',
      columnKey,
    },
  })

  const sortedSponsors = useMemo(() => {
    return [...sponsors].sort((a, b) => {
      const aVal = calculateSponsorValue(a)
      const bVal = calculateSponsorValue(b)
      const aNOK = convertCurrency(
        aVal.value,
        aVal.currency as 'NOK' | 'USD' | 'EUR' | 'GBP',
        'NOK',
      )
      const bNOK = convertCurrency(
        bVal.value,
        bVal.currency as 'NOK' | 'USD' | 'EUR' | 'GBP',
        'NOK',
      )
      return bNOK - aNOK
    })
  }, [sponsors, convertCurrency])

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'flex min-h-0 flex-col transition-all',
        'w-[85vw] max-w-sm shrink-0 snap-start snap-always',
        'lg:w-auto lg:shrink lg:snap-align-none',
        isOver && 'rounded-lg bg-indigo-50/30 dark:bg-indigo-900/20',
      )}
    >
      <div className="mb-3 flex shrink-0 items-center justify-between px-2">
        <h3 className="font-semibold text-brand-cloud-blue dark:text-blue-400">
          {title}
        </h3>
        <span className="min-w-6 rounded-full bg-brand-cloud-blue px-2 py-1 text-center text-xs text-white dark:bg-blue-600">
          {isLoading ? (
            <span className="inline-block h-4 w-4 animate-pulse rounded-full bg-white/30" />
          ) : (
            sponsors.length
          )}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="mb-1.5 flex h-8 items-center justify-center">
                <div className="h-6 w-20 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="mb-1 flex items-center justify-between gap-1">
                <div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                <div className="h-3 w-12 rounded bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="h-5 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2">
          {sortedSponsors.map((sponsor) => (
            <SponsorCard
              key={sponsor._id}
              sponsor={sponsor}
              currentView={currentView}
              columnKey={columnKey}
              isSelected={selectedIds.includes(sponsor._id)}
              isSelectionMode={isSelectionMode}
              onToggleSelect={() => onSponsorToggleSelect?.(sponsor._id)}
              onEdit={() => onSponsorClick(sponsor)}
              onDelete={() => onSponsorDelete(sponsor._id)}
              onEmail={
                onSponsorEmail ? () => onSponsorEmail(sponsor) : undefined
              }
            />
          ))}

          {sponsors.length === 0 && (
            <button
              onClick={onAddClick}
              className="w-full cursor-pointer rounded-lg border-2 border-dashed border-gray-300 bg-transparent p-3 text-center text-sm text-gray-500 transition-all hover:border-brand-cloud-blue hover:text-brand-cloud-blue dark:border-gray-600 dark:text-gray-500 dark:hover:border-blue-500 dark:hover:text-blue-400"
            >
              <PlusIcon className="mx-auto mb-1 h-5 w-5" />
              Add sponsor
            </button>
          )}

          {sponsors.length > 0 && (
            <button
              onClick={onAddClick}
              className="w-full cursor-pointer rounded-lg border-2 border-dashed border-gray-300 bg-transparent p-3 text-center text-sm text-gray-500 transition-all hover:border-brand-cloud-blue hover:text-brand-cloud-blue dark:border-gray-600 dark:text-gray-500 dark:hover:border-blue-500 dark:hover:text-blue-400"
            >
              <PlusIcon className="mx-auto mb-1 h-5 w-5" />
              Add sponsor
            </button>
          )}
        </div>
      )}
    </div>
  )
}
