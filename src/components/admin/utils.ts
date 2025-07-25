import { Status } from '@/lib/proposal/types'

/**
 * Legacy utility function to get consistent status badge styling across admin components
 * @deprecated Use getStatusBadgeConfig from @/lib/proposal/formatting instead
 * @param status - The proposal status
 * @returns CSS classes for status badge styling
 */
export function getStatusBadgeStyle(status: Status): string {
  console.warn(
    'getStatusBadgeStyle is deprecated. Use getStatusBadgeConfig from @/lib/proposal/formatting instead.',
  )

  switch (status) {
    case Status.accepted:
      return 'bg-green-100 text-green-800 ring-green-600/20'
    case Status.rejected:
      return 'bg-red-100 text-red-800 ring-red-600/20'
    case Status.confirmed:
      return 'bg-blue-100 text-blue-800 ring-blue-600/20'
    case Status.submitted:
      return 'bg-yellow-100 text-yellow-800 ring-yellow-600/20'
    case Status.draft:
      return 'bg-gray-100 text-gray-800 ring-gray-600/20'
    case Status.withdrawn:
      return 'bg-orange-100 text-orange-800 ring-orange-600/20'
    case Status.deleted:
      return 'bg-red-100 text-red-800 ring-red-600/20'
    default:
      return 'bg-gray-100 text-gray-800 ring-gray-600/20'
  }
}

/**
 * Re-export clsx as our standard class name utility
 * This provides a consistent API while leveraging the battle-tested clsx library
 */
export { default as classNames } from 'clsx'

/**
 * Common error display props interface
 */
export interface ErrorDisplayProps {
  title: string
  message: string
  backLink?: {
    href: string
    label: string
  }
  homeLink?: boolean
}
