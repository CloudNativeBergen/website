'use client'

import { api } from '@/lib/trpc/client'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import type {
  MissingField,
  ReadinessSource,
} from '@/lib/sponsor-crm/contract-readiness'

const SOURCE_LABELS: Record<ReadinessSource, string> = {
  organizer: 'Conference settings',
  sponsor: 'Sponsor (via onboarding)',
  pipeline: 'CRM pipeline',
}

function MissingFieldList({ items }: { items: MissingField[] }) {
  if (items.length === 0) return null
  return (
    <ul className="mt-1 space-y-0.5">
      {items.map((item) => (
        <li
          key={item.field}
          className="text-xs text-gray-600 dark:text-gray-400"
        >
          &bull; {item.label}
        </li>
      ))}
    </ul>
  )
}

export function ContractReadinessIndicator({
  sponsorForConferenceId,
}: {
  sponsorForConferenceId: string
}) {
  const { data: readiness, isLoading } =
    api.sponsor.contractTemplates.contractReadiness.useQuery(
      { id: sponsorForConferenceId },
      { enabled: !!sponsorForConferenceId },
    )

  if (isLoading || !readiness) return null

  if (readiness.ready) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5 text-green-500" />
          <span className="text-sm font-medium text-green-800 dark:text-green-300">
            Contract ready
          </span>
        </div>
      </div>
    )
  }

  const grouped: Record<ReadinessSource, MissingField[]> = {
    organizer: readiness.missing.filter(
      (m: MissingField) => m.source === 'organizer',
    ),
    sponsor: readiness.missing.filter(
      (m: MissingField) => m.source === 'sponsor',
    ),
    pipeline: readiness.missing.filter(
      (m: MissingField) => m.source === 'pipeline',
    ),
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
      <div className="flex items-center gap-2">
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500" />
        <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
          Missing data for contract
        </span>
      </div>
      <div className="mt-2 space-y-2 pl-7">
        {(Object.entries(grouped) as [ReadinessSource, MissingField[]][])
          .filter(([, items]) => items.length > 0)
          .map(([source, items]) => (
            <div key={source}>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {SOURCE_LABELS[source]}:
              </p>
              <MissingFieldList items={items} />
            </div>
          ))}
      </div>
    </div>
  )
}
