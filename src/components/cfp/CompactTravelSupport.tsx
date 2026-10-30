import Link from 'next/link'
import { BanknotesIcon, PencilIcon } from '@heroicons/react/24/outline'
import type { TravelSupportWithExpenses } from '@/lib/travel-support/types'
import { StatusBadge } from '@/components/travel-support/StatusBadge'
import { useImpersonateQueryString } from '@/lib/impersonation'
import { formatCurrency } from '@/lib/format'
import { formatConferenceDayDate, osloTodayDateString } from '@/lib/time'

// A YYYY-MM-DD date or an instant, shown as its Oslo calendar day.
const day = (value?: string) =>
  !value || Number.isNaN(Date.parse(value))
    ? undefined
    : formatConferenceDayDate(
        value.length === 10 ? value : osloTodayDateString(new Date(value)),
      )

interface CompactTravelSupportProps {
  travelSupport: TravelSupportWithExpenses
}

export function CompactTravelSupport({
  travelSupport,
}: CompactTravelSupportProps) {
  const queryString = useImpersonateQueryString()
  // Open the request for THIS card's conference, not the current domain's.
  const conferenceRef = travelSupport.conference?._ref
  const expenseHref = conferenceRef
    ? `/cfp/expense${queryString ? `${queryString}&` : '?'}conferenceId=${encodeURIComponent(conferenceRef)}`
    : `/cfp/expense${queryString}`

  // Show edit icon only for draft status
  const canEdit = travelSupport.status === 'draft'

  // The approved amount is in NOK (set by organizers in the admin review).
  const { approvedAmount, expectedPaymentDate, paidAt } = travelSupport
  const isApproved = travelSupport.status === 'approved'
  const isPaid = travelSupport.status === 'paid'
  const payout = isPaid
    ? day(paidAt)
      ? `Paid out ${day(paidAt)}`
      : 'Paid out'
    : isApproved
      ? day(expectedPaymentDate)
        ? `Payout expected ${day(expectedPaymentDate)}`
        : 'Payout pending'
      : undefined
  const details =
    (isApproved || isPaid) &&
    [
      approvedAmount != null &&
        `${formatCurrency(approvedAmount, 'NOK')} approved`,
      payout,
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
        Travel Support
      </h4>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm transition-colors hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <BanknotesIcon className="h-4 w-4 shrink-0 text-teal-500 dark:text-teal-400" />
          <Link
            href={expenseHref}
            className="flex-1 font-medium text-gray-900 hover:text-brand-cloud-blue dark:text-white dark:hover:text-blue-400"
          >
            Travel Reimbursement Request
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={travelSupport.status} />
          {canEdit && (
            <Link
              href={expenseHref}
              className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title="Edit travel support"
              aria-label="Edit travel support"
            >
              <PencilIcon className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
      {details && (
        <p className="mt-1 px-3 text-xs text-gray-600 dark:text-gray-400">
          {details}
        </p>
      )}
    </div>
  )
}
