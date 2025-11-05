'use client'

import type { SponsorForConferenceExpanded } from '@/lib/sponsor-crm/types'
import { SponsorCard } from './SponsorCard'
import { PlusIcon } from '@heroicons/react/24/outline'
import { useExchangeRates } from '@/hooks/useExchangeRates'
import { calculateSponsorValue } from './utils'

interface SponsorBoardColumnProps {
  title: string
  sponsors: SponsorForConferenceExpanded[]
  isLoading?: boolean
  onSponsorClick: (sponsor: SponsorForConferenceExpanded) => void
  onSponsorDelete: (sponsorId: string) => void
  onAddClick: () => void
  emptyMessage?: string
}

export function SponsorBoardColumn({
  title,
  sponsors,
  isLoading = false,
  onSponsorClick,
  onSponsorDelete,
  onAddClick,
  emptyMessage = 'No sponsors',
}: SponsorBoardColumnProps) {
  const { convertCurrency } = useExchangeRates()

  const calculateValueInNOK = (
    sponsor: SponsorForConferenceExpanded,
  ): number => {
    const { value, currency } = calculateSponsorValue(sponsor)
    return convertCurrency(
      value,
      currency as 'NOK' | 'USD' | 'EUR' | 'GBP',
      'NOK',
    )
  }

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-brand-cloud-blue dark:text-blue-400">
          {title}
        </h3>
        <span className="rounded-full bg-brand-cloud-blue px-2 py-1 text-xs text-white dark:bg-blue-600">
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
        <div className="space-y-3">
          {sponsors
            .sort((a, b) => calculateValueInNOK(b) - calculateValueInNOK(a))
            .map((sponsor) => (
              <SponsorCard
                key={sponsor._id}
                sponsor={sponsor}
                onEdit={() => onSponsorClick(sponsor)}
                onDelete={() => onSponsorDelete(sponsor._id)}
              />
            ))}

          {sponsors.length === 0 && (
            <button
              onClick={onAddClick}
              className="w-full rounded-lg border-2 border-dashed border-gray-300 bg-transparent p-4 text-center text-sm text-gray-500 transition-all hover:border-brand-cloud-blue hover:text-brand-cloud-blue dark:border-gray-600 dark:text-gray-500 dark:hover:border-blue-500 dark:hover:text-blue-400"
            >
              {emptyMessage}
            </button>
          )}

          {sponsors.length > 0 && (
            <button
              onClick={onAddClick}
              className="group w-full rounded-lg border-2 border-dashed border-gray-300 bg-transparent p-3 text-center text-sm text-gray-500 transition-all hover:border-brand-cloud-blue hover:text-brand-cloud-blue dark:border-gray-600 dark:text-gray-500 dark:hover:border-blue-500 dark:hover:text-blue-400"
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
