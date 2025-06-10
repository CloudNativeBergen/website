import { Status } from '@/lib/proposal/types'

/**
 * Utility function to get consistent status badge styling across admin components
 * @param status - The proposal status
 * @returns CSS classes for status badge styling
 */
export function getStatusBadgeStyle(status: Status): string {
  switch (status) {
    case Status.accepted:
      return 'bg-green-100 text-green-800'
    case Status.rejected:
      return 'bg-red-100 text-red-800'
    case Status.confirmed:
      return 'bg-blue-100 text-blue-800'
    case Status.submitted:
      return 'bg-yellow-100 text-yellow-800'
    case Status.draft:
      return 'bg-gray-100 text-gray-800'
    case Status.withdrawn:
      return 'bg-orange-100 text-orange-800'
    case Status.deleted:
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

/**
 * Utility function for combining CSS classes
 * @param classes - Array of CSS class strings
 * @returns Combined class string with falsy values filtered out
 */
export function classNames(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

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
