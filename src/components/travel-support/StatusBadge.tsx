import { TravelSupportStatus } from '@/lib/travel-support/types'
import { TravelSupportService } from '@/lib/travel-support/service'

interface StatusBadgeProps {
  status: TravelSupportStatus
  className?: string
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const displayName = TravelSupportService.getStatusDisplayName(status)
  const color = TravelSupportService.getStatusColor(status)

  const colorClasses = {
    gray: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    green:
      'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    purple:
      'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        colorClasses[color as keyof typeof colorClasses] || colorClasses.gray
      } ${className}`}
    >
      {displayName}
    </span>
  )
}
