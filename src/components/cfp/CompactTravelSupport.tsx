import Link from 'next/link'
import { BanknotesIcon, PencilIcon } from '@heroicons/react/24/outline'
import {
  CheckBadgeIcon,
  ClockIcon,
  XCircleIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/solid'
import type { TravelSupportWithExpenses } from '@/lib/travel-support/types'
import { useImpersonateQueryString } from '@/lib/impersonation'

interface CompactTravelSupportProps {
  travelSupport: TravelSupportWithExpenses
}

export function CompactTravelSupport({
  travelSupport,
}: CompactTravelSupportProps) {
  const queryString = useImpersonateQueryString()

  const getStatusDisplay = () => {
    switch (travelSupport.status) {
      case 'draft':
        return {
          icon: DocumentTextIcon,
          text: 'Draft',
          color:
            'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400',
        }
      case 'submitted':
        return {
          icon: ClockIcon,
          text: 'Under Review',
          color:
            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        }
      case 'approved':
        return {
          icon: CheckBadgeIcon,
          text: 'Approved',
          color:
            'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        }
      case 'paid':
        return {
          icon: CheckBadgeIcon,
          text: 'Paid',
          color:
            'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        }
      case 'rejected':
        return {
          icon: XCircleIcon,
          text: 'Rejected',
          color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        }
      default:
        return {
          icon: DocumentTextIcon,
          text: 'Unknown',
          color:
            'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400',
        }
    }
  }

  const status = getStatusDisplay()
  const StatusIcon = status.icon

  // Show edit icon only for draft status
  const canEdit = travelSupport.status === 'draft'

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
        Travel Support
      </h4>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm transition-colors hover:border-gray-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <BanknotesIcon className="h-4 w-4 shrink-0 text-teal-500 dark:text-teal-400" />
          <Link
            href={`/speaker/expense${queryString}`}
            className="flex-1 font-medium text-gray-900 hover:text-brand-cloud-blue dark:text-white dark:hover:text-blue-400"
          >
            Travel Reimbursement Request
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}
          >
            <StatusIcon className="h-3 w-3" />
            {status.text}
          </span>
          {canEdit && (
            <Link
              href={`/speaker/expense${queryString}`}
              className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              title="Edit travel support"
            >
              <PencilIcon className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
