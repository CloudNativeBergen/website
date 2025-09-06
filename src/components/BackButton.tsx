'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

interface BackLinkProps {
  fallbackUrl?: string
  children?: React.ReactNode
  className?: string
  variant?: 'link' | 'button'
}

export function BackLink({
  fallbackUrl = '/',
  children = 'Back',
  className = '',
  variant = 'link',
}: BackLinkProps) {
  const router = useRouter()

  const handleBack = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back()
    } else {
      router.push(fallbackUrl)
    }
  }

  const baseClasses = 'inline-flex items-center space-x-2 transition-colors'

  const variantClasses = {
    link: 'text-sm font-medium text-brand-cloud-blue hover:text-brand-cloud-blue/80 dark:text-blue-400 dark:hover:text-blue-300',
    button:
      'rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-cloud-blue focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white dark:focus:ring-offset-gray-800',
  }

  return (
    <Link
      href={fallbackUrl}
      onClick={handleBack}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
    >
      <ArrowLeftIcon className="h-4 w-4" />
      <span>{children}</span>
    </Link>
  )
}

// Keep BackButton as an alias for backward compatibility
export const BackButton = BackLink
