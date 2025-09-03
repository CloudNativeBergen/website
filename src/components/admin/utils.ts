import { Status } from '@/lib/proposal/types'

/**
 * Legacy utility function to get consistent status badge styling across admin components with dark mode support
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
      return 'bg-green-100 text-green-800 ring-green-600/20 dark:bg-green-900/30 dark:text-green-300 dark:ring-green-500/30'
    case Status.rejected:
      return 'bg-red-100 text-red-800 ring-red-600/20 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-500/30'
    case Status.confirmed:
      return 'bg-blue-100 text-blue-800 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-500/30'
    case Status.submitted:
      return 'bg-yellow-100 text-yellow-800 ring-yellow-600/20 dark:bg-yellow-900/30 dark:text-yellow-300 dark:ring-yellow-500/30'
    case Status.draft:
      return 'bg-gray-100 text-gray-800 ring-gray-600/20 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600/30'
    case Status.withdrawn:
      return 'bg-orange-100 text-orange-800 ring-orange-600/20 dark:bg-orange-900/30 dark:text-orange-300 dark:ring-orange-500/30'
    case Status.deleted:
      return 'bg-red-100 text-red-800 ring-red-600/20 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-500/30'
    default:
      return 'bg-gray-100 text-gray-800 ring-gray-600/20 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600/30'
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
