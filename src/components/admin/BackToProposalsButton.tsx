'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeftIcon } from '@heroicons/react/20/solid'

interface BackToProposalsButtonProps {
  className?: string
  fallbackHref?: string
}

/**
 * Smart back button that uses browser history when available,
 * otherwise falls back to the proposals list
 */
export function BackToProposalsButton({
  className = "inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer",
  fallbackHref = "/admin/proposals"
}: BackToProposalsButtonProps) {
  const router = useRouter()

  const handleBack = () => {
    // Check if there's browser history available and we're in a browser environment
    if (typeof window !== 'undefined' && window.history.length > 1) {
      // Check if the previous page was from the same origin (security check)
      const referrer = document.referrer
      const currentOrigin = window.location.origin

      if (referrer && referrer.startsWith(currentOrigin)) {
        // Check if the referrer is the proposals page (with or without query params)
        const referrerPath = new URL(referrer).pathname
        const hasProposalsQuery = referrer.includes('/admin/proposals')

        if (referrerPath === '/admin/proposals' || hasProposalsQuery) {
          // Use browser back to preserve filters and scroll position
          router.back()
          return
        }
      }
    }

    // Fallback to direct navigation when:
    // - No browser history available
    // - Previous page wasn't from our domain
    // - Previous page wasn't the proposals list
    router.push(fallbackHref)
  }

  return (
    <button
      onClick={handleBack}
      className={className}
      type="button"
    >
      <ChevronLeftIcon className="mr-2 h-4 w-4 cur" />
      Back to Proposals
    </button>
  )
}
